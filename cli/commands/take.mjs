// walkthrough take [scene…] [--auto] [--fresh] [--from N --to N] [--parallel N]: the take runner,
// then the takes it wrote are recorded in state.takes.
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { announce } from "../lib/exec.mjs";
import { CliError, kitPath, requireProject, resolvedConfig } from "../lib/project.mjs";
import { now, rel } from "../lib/state.mjs";
import { fmtBytes, printTable } from "../lib/table.mjs";

const usage = `walkthrough take [scene ...] [--auto] [--fresh] [--from N] [--to N] [--parallel N] [runner flags]

Runs node <kit>/recorder/takes/run.mjs --config <project>/walkthrough.config.mjs [args], with every
argument passed through (scenes by number or name; --base-url, --storage, --mode, --viewport,
--studio-config, --popups, --dialogs too). See recorder/README.md, "The take runner".
  --auto          no go files: continue while takes pass, stop on the first failure
  --parallel N    site mode only: N independent takes at a time (implies --auto; refused with a studio)
  (no --auto)     after each take the runner waits for <takes>/_runner/go-N.json (next | redo | stop)

When the runner exits, every take it wrote in this run is recorded in state.takes:
  { recordedAt, ok, accepted, checkpoint, duration, masterSync, gaps: { outsideWaitsMs, insideWaitsMs },
    warnings, uniqueFps, dir }
ok = the runner's verdict (no error, master sync passed, longest gap outside waits <= gate.maxGapMs).
accepted = ok under --auto/--parallel; with go files, true when the last go file for that take was
"next" or "stop", null when the run ended without one.
Clean up: for every ok take of this run that was not turned down (a "redo"), the raw screencast frames
(raw/frames.bin, raw/frames.ndjson) are removed: master.mp4 is the footage, and raw/delivered.json
stays for takes/INDEX.md. Not when walkthrough.config.mjs sets finish.keepRaw: true (to re-encode a
master with recorder/remux.mjs). Recorded as rawRemoved in state.takes. Exit code: the runner's.`;

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};
const mtime = (p) => {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
};

export default {
  name: "take",
  describe: "record takes with the take runner and record them in state.json",
  usage,
  async run(argv, ctx) {
    const project = requireProject(ctx);
    if (!project.configFile) throw new CliError(`${project.dir} has no walkthrough.config.mjs (\`walkthrough init\` writes one)`, 2);
    const c = await resolvedConfig(project);
    if (!c) throw new CliError(`walkthrough.config.mjs does not load: ${project.configError?.message ?? "unknown error"}`);
    const runStart = Date.now() - 2000;
    const r = await ctx.exec(process.execPath, [kitPath("recorder/takes/run.mjs"), "--config", project.configFile, ...argv], { cwd: project.dir });

    // ---- what did this run write?
    const auto = argv.includes("--auto") || argv.some((a) => a === "--parallel" || a.startsWith("--parallel="));
    const takesDir = c.takesDir;
    const runnerDir = c.runnerDir;
    const statuses = new Map();
    if (existsSync(runnerDir))
      for (const f of readdirSync(runnerDir)) {
        if (!/^status-.+\.json$/.test(f) || mtime(join(runnerDir, f)) < runStart) continue;
        const s = readJson(join(runnerDir, f));
        if (s?.name) statuses.set(s.name, s);
      }
    const fresh = new Set(statuses.keys());
    if (existsSync(takesDir))
      for (const d of readdirSync(takesDir)) {
        if (d.startsWith("_")) continue;
        if (mtime(join(takesDir, d, "take.json")) >= runStart) fresh.add(d);
      }
    if (!fresh.size) {
      ctx.log.info("take: no new takes were written");
      return r.code;
    }

    // go-file decisions (no --auto): the last go-N.done-<ms>.json of this run per scene number
    const lastGo = (n) => {
      if (!existsSync(runnerDir)) return null;
      const files = readdirSync(runnerDir)
        .map((f) => f.match(new RegExp(`^go-${String(n).replace(/[^\w-]/g, "")}\\.done-(\\d+)\\.json$`)))
        .filter((m) => m && Number(m[1]) >= runStart)
        .sort((a, b) => Number(a[1]) - Number(b[1]));
      return files.length ? readJson(join(runnerDir, files.at(-1)[0])) : null;
    };
    // scene checkpoints (--auto with a studio checkpoints after a passing take whose scene names one)
    let sceneCheckpoint = () => null;
    if (auto && c.studio) {
      try {
        const { loadScenes } = await import(pathToFileURL(kitPath("recorder/config.mjs")).href);
        const scenes = await loadScenes(c);
        sceneCheckpoint = (name) => scenes.find((s) => s.name === name)?.checkpoint ?? null;
      } catch {}
    }

    const rows = [];
    for (const name of [...fresh].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
      const dir = join(takesDir, name);
      const tj = readJson(join(dir, "take.json"));
      const st = statuses.get(name);
      const ok = st ? Boolean(st.ok) : Boolean(tj?.masterSync?.pass && (tj?.gaps?.outsideWaits?.ms ?? Infinity) <= c.gate.maxGapMs);
      const go = !auto && st ? lastGo(st.n) : null;
      const accepted = auto ? ok : go ? go.action === "next" || go.action === "stop" : null;
      const checkpoint = auto ? (ok ? sceneCheckpoint(name) : null) : (go?.checkpoint ?? null);
      const entry = {
        recordedAt: tj ? new Date(mtime(join(dir, "take.json"))).toISOString() : now(),
        ok,
        accepted,
        checkpoint,
        duration: (() => { const d = Number(st?.duration ?? tj?.master?.duration); return Number.isFinite(d) ? d : null; })(), // ffprobe gives a string
        masterSync: tj?.masterSync?.pass ?? st?.masterSync?.pass ?? null,
        gaps: { outsideWaitsMs: (st?.gaps ?? tj?.gaps)?.outsideWaits?.ms ?? null, insideWaitsMs: (st?.gaps ?? tj?.gaps)?.insideWaits?.ms ?? null },
        warnings: (st?.warnings ?? tj?.warnings ?? []).length,
        uniqueFps: st?.uniqueFps ?? tj?.uniqueFps ?? null,
        error: st?.error ? String(st.error).split("\n")[0] : (st?.finishError ? String(st.finishError).split("\n")[0] : undefined),
        dir: rel(project.dir, dir),
      };
      if (entry.error === undefined) delete entry.error;
      project.state.takes[name] = entry;
      if (checkpoint) project.state.checkpoints.push({ name: checkpoint, at: entry.recordedAt, by: "take", after: name });
      rows.push({ take: name, ok: entry.ok, accepted: entry.accepted, sync: entry.masterSync, "gap out ms": entry.gaps.outsideWaitsMs, "gap in ms": entry.gaps.insideWaitsMs, warnings: entry.warnings, checkpoint: entry.checkpoint ?? "" });
    }

    // ---- clean up after yourself: raw frames of the ok takes (the master is the footage)
    let freed = 0;
    const cleaned = [];
    if (!c.finish?.keepRaw)
      for (const name of fresh) {
        const t = project.state.takes[name];
        if (!t?.ok || t.accepted === false) continue;
        const files = ["frames.bin", "frames.ndjson"].map((f) => join(takesDir, name, "raw", f)).filter((f) => existsSync(f));
        if (!files.length) continue;
        for (const f of files) freed += statSync(f).size;
        announce("/bin/rm", ["-f", ...files]);
        for (const f of files) rmSync(f, { force: true });
        t.rawRemoved = "frames";
        cleaned.push(name);
      }
    project.save();
    ctx.log.info("\nrecorded in state.json:");
    printTable(rows);
    if (cleaned.length) ctx.log.info(`\nraw frames removed from ${cleaned.length} ok take(s) (${fmtBytes(freed)}): ${cleaned.join(", ")} (finish.keepRaw: true keeps them)`);
    else if (c.finish?.keepRaw) ctx.log.info("\nfinish.keepRaw is true: raw frames kept (`walkthrough clean` removes those of accepted takes)");
    return r.code;
  },
};
