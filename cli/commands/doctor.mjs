// walkthrough doctor [--capture]: is this machine (and this project) ready? docs/DESIGN-batch-2.md §3.
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "../lib/args.mjs";
import { bufferOf, freeBytes, MIN_FREE_BYTES, WARN_FREE_BYTES } from "../lib/disk.mjs";
import { capture, which } from "../lib/exec.mjs";
import { insideKit, kitPath, resolvedConfig } from "../lib/project.mjs";
import { now } from "../lib/state.mjs";
import { fmtBytes, printTable } from "../lib/table.mjs";

const HYPERFRAMES = "hyperframes@0.9.16";
const SKILLS = ["hyperframes", "media-use", "hyperframes-cli"];

const usage = `walkthrough doctor [--capture] [--out <file>] [--json]

Checks this machine and the project, prints a table (ok / info / warn / fail) and exits 1 on any fail:
  node >= 22; ffmpeg + ffprobe (ffmpeg with libx264; drawtext, else warn: contact sheets lose labels);
  python3 with numpy and PIL; npx ${HYPERFRAMES} --version; Playwright Chromium for recorder/;
  the HyperFrames skills (${SKILLS.join(", ")}) in ~/.claude; free disk on the project volume and the
  buffer (warn < 10 GB, fail < 5 GB unless the buffer has room); ELEVENLABS_API_KEY set or not (the
  value is never printed); caffeinate on macOS; the project config, scenes, studio config and base URL.
--capture  also runs the 8 s capture test (recorder/capture-test.mjs new 2 idle 8) and reports the
           delivered fps, unique frames per second, the longest gap and the sync drift
--out      where to write the JSON report (default <project>/doctor.json, else ./doctor.json; never in the kit)
--json     print the JSON report instead of the table`;

function findSkill(name) {
  const roots = [join(homedir(), ".claude", "skills"), process.env.CLAUDE_CONFIG_DIR && join(process.env.CLAUDE_CONFIG_DIR, "skills")].filter(Boolean);
  for (const r of roots) if (existsSync(join(r, name, "SKILL.md"))) return join(r, name);
  // plugin caches: ~/.claude/plugins/**/skills/<name>/SKILL.md (bounded walk)
  const walk = (dir, depth) => {
    if (depth < 0) return null;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.name === "skills" && existsSync(join(p, name, "SKILL.md"))) return join(p, name);
      const hit = walk(p, depth - 1);
      if (hit) return hit;
    }
    return null;
  };
  return walk(join(homedir(), ".claude", "plugins"), 6);
}

async function reachable(url) {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 5000);
    const r = await fetch(url, { method: "GET", signal: ac.signal, redirect: "manual" });
    clearTimeout(t);
    await r.body?.cancel?.();
    return { ok: true, status: r.status };
  } catch (err) {
    return { ok: false, error: err?.cause?.code ?? err?.name ?? String(err) };
  }
}

export default {
  name: "doctor",
  describe: "check tools, disk, keys and the project config; --capture runs the 8 s capture test",
  usage,
  async run(argv, ctx) {
    const { opts } = parseArgs(argv, { boolean: ["capture", "json"], string: ["out"] });
    const rows = [];
    const add = (check, status, detail = "") => rows.push({ check, status, detail });
    const project = ctx.project;

    // ---- runtimes and tools
    const major = Number(process.versions.node.split(".")[0]);
    add("node", major >= 22 ? "ok" : "fail", `${process.versions.node}${major >= 22 ? "" : " (need 22+)"}`);

    if (which("ffmpeg")) {
      const v = capture("ffmpeg", ["-hide_banner", "-version"]).stdout.split("\n")[0].replace(/^ffmpeg version /, "").split(" ")[0];
      add("ffmpeg", "ok", v);
      const enc = capture("ffmpeg", ["-hide_banner", "-encoders"]).stdout;
      add("ffmpeg libx264", /\blibx264\b/.test(enc) ? "ok" : "fail", /\blibx264\b/.test(enc) ? "" : "no libx264 encoder: the film and delivery encodes need it");
      const flt = capture("ffmpeg", ["-hide_banner", "-filters"]).stdout;
      add("ffmpeg drawtext", /\bdrawtext\b/.test(flt) ? "ok" : "warn", /\bdrawtext\b/.test(flt) ? "" : "no drawtext (ffmpeg built without libfreetype): contact sheets lose their labels");
    } else add("ffmpeg", "fail", "not on PATH (ffmpeg 8 with ffprobe)");
    add("ffprobe", which("ffprobe") ? "ok" : "fail", which("ffprobe") ? "" : "not on PATH");

    if (which("python3")) {
      const v = capture("python3", ["-I", "--version"]).stdout.trim() || capture("python3", ["-I", "--version"]).stderr.trim();
      add("python3", "ok", v.replace(/^Python /, ""));
      for (const [mod, pip] of [["numpy", "numpy"], ["PIL", "Pillow"]]) {
        const r = capture("python3", ["-I", "-c", `import ${mod}; print(getattr(${mod}, "__version__", ""))`]);
        add(`python3 ${mod}`, r.code === 0 ? "ok" : "warn", r.code === 0 ? r.stdout.trim() : `missing: python3 -m pip install ${pip} (sound analysis, delivery sheets, review scripts)`);
      }
    } else add("python3", "fail", "not on PATH");

    const hf = capture("npx", ["--yes", HYPERFRAMES, "--version"], { timeout: 180_000 });
    add(`npx ${HYPERFRAMES}`, hf.code === 0 ? "ok" : "fail", hf.code === 0 ? hf.stdout.trim().split("\n").at(-1) : `does not resolve (offline and not cached?): ${(hf.stderr || hf.stdout).trim().split("\n").at(-1) ?? ""}`);

    // ---- Playwright Chromium for the recorder
    const pw = kitPath("recorder/node_modules/playwright-core");
    if (!existsSync(pw)) add("playwright-core", "fail", `not installed: cd ${kitPath()} && npm run setup`);
    else {
      const r = capture(process.execPath, ["--input-type=module", "-e", "const m = await import('playwright-core'); console.log(m.chromium.executablePath())"], { cwd: kitPath("recorder") });
      const exe = r.stdout.trim().split("\n").at(-1);
      let v = "";
      try {
        v = JSON.parse(readFileSync(join(pw, "package.json"), "utf8")).version;
      } catch {}
      add("playwright-core", "ok", v);
      add("chromium", exe && existsSync(exe) ? "ok" : "fail", exe && existsSync(exe) ? exe.replace(homedir(), "~") : `not installed: cd ${kitPath("recorder")} && npx playwright-core install chromium`);
    }

    // ---- skills
    const missing = [];
    for (const s of SKILLS) if (!findSkill(s)) missing.push(s);
    add("hyperframes skills", missing.length ? "warn" : "ok", missing.length ? `missing ${missing.map((s) => "/" + s).join(", ")}: run \`npx hyperframes skills update\` yourself, then start a new session` : SKILLS.map((s) => "/" + s).join(", "));

    // ---- disk
    const diskAt = project?.dir ?? process.cwd();
    const pf = freeBytes(diskAt);
    const buffer = project ? bufferOf(project) : process.env.WALKTHROUGH_BUFFER || null;
    const bufMounted = buffer && (existsSync(buffer) || existsSync(join(buffer, "..")));
    const bf = bufMounted ? freeBytes(buffer) : null;
    const bufferOk = bf && bf.free >= MIN_FREE_BYTES;
    if (!pf) add("disk (project)", "warn", `free space unknown at ${diskAt}`);
    else {
      const st = pf.free < MIN_FREE_BYTES ? (bufferOk ? "warn" : "fail") : pf.free < WARN_FREE_BYTES ? "warn" : "ok";
      const note = pf.free < MIN_FREE_BYTES ? (bufferOk ? ": renders will spill to the buffer" : ": render stops below 5 GB; free space or set `buffer`") : pf.free < WARN_FREE_BYTES ? ": under 10 GB" : "";
      add("disk (project)", st, `${fmtBytes(pf.free)} free on ${pf.mount}${note}`);
    }
    if (buffer) add("disk (buffer)", !bufMounted ? "warn" : bf.free < MIN_FREE_BYTES ? "warn" : "ok", !bufMounted ? `${buffer}: not mounted` : `${fmtBytes(bf.free)} free at ${buffer}`);
    else add("disk (buffer)", "info", "no buffer set (walkthrough.config.mjs `buffer`, or WALKTHROUGH_BUFFER)");

    // ---- keys and power (names only, never values)
    add("ELEVENLABS_API_KEY", "info", process.env.ELEVENLABS_API_KEY ? "set" : "not set: music and voice go through the claude.ai connector route (docs/ELEVENLABS.md)");
    if (process.platform === "darwin") add("caffeinate", which("caffeinate") ? "ok" : "warn", which("caffeinate") ? "long steps run under caffeinate -i" : "not found: the Mac may sleep during a render");
    else add("caffeinate", "info", `not macOS (${process.platform}): keep the machine awake during renders yourself`);

    // ---- the project
    let resolved = null;
    if (!project) add("project", "info", "none resolved (run inside a project, --project <dir>, or WALKTHROUGH_PROJECT)");
    else {
      add("project", "ok", `${project.dir} (${project.source}; state.json ${project.hasStateFile ? "present" : "not yet written"})`);
      if (!project.configFile) add("project config", "warn", "no walkthrough.config.mjs (takes cannot be recorded)");
      else {
        resolved = await resolvedConfig(project);
        if (project.configError || !resolved) add("project config", "fail", String(project.configError?.message ?? "does not load").split("\n")[0]);
        else {
          add("project config", "ok", `baseUrl ${resolved.baseUrl}, viewport ${resolved.preset}, takes ${resolved.takesDir.replace(project.dir + "/", "")}`);
          add("scenes", existsSync(resolved.scenes) ? "ok" : "fail", existsSync(resolved.scenes) ? resolved.scenes.replace(project.dir + "/", "") : `${resolved.scenes} not found`);
          if (resolved.storageState) add("storage state", existsSync(resolved.storageState) ? "ok" : "fail", existsSync(resolved.storageState) ? "present (a credential: keep it out of git)" : `${resolved.storageState} not found: recorder/tools/save-login.mjs`);
          if (resolved.studio) {
            const sc = resolved.studio.config;
            add("studio config", sc && existsSync(sc) ? "ok" : "fail", sc && existsSync(sc) ? sc.replace(project.dir + "/", "") : `${sc ?? "studio.config"} not found`);
            add("studio scripts", resolved.studio.bin && existsSync(join(resolved.studio.bin, "up.sh")) ? "ok" : "fail", resolved.studio.bin ?? "studio.bin not set");
          }
          const reach = await reachable(resolved.baseUrl);
          add("base URL", reach.ok ? "ok" : resolved.studio ? "info" : "warn", reach.ok ? `${resolved.baseUrl} answers ${reach.status}` : `${resolved.baseUrl} does not answer (${reach.error})${resolved.studio ? ": `walkthrough studio up` starts it" : ""}`);
        }
      }
    }

    // ---- capture test
    let captureResult = null;
    if (opts.capture) {
      const takes = resolved?.takesDir ?? mkdtempSync(join(tmpdir(), "walkthrough-doctor-"));
      const r = await ctx.exec(process.execPath, [kitPath("recorder/capture-test.mjs"), "new", "2", "idle", "8"], { env: { WALKTHROUGH_TAKES: takes }, inherit: false });
      const line = r.stdout.trim().split("\n").reverse().find((l) => l.startsWith("{"));
      try {
        captureResult = JSON.parse(line);
      } catch {}
      if (!captureResult) add("capture test", "fail", `no result (exit ${r.code}): ${(r.stderr || r.stdout).trim().split("\n").at(-1) ?? ""}`);
      else {
        const c = captureResult;
        const pass = c.uniquePass && c.gapPass && c.syncPass && c.frameSizePass;
        add("capture test", pass ? "ok" : "fail", `${c.delivery.fps} fps delivered, ${c.uniquePerSecond.median} unique/s (median), longest gap ${c.longestGapMs} ms, drift ${c.sync.driftFrames} frames, master sync ${c.masterSync.pass ? "pass" : "FAIL"}, ${c.frameSize}`);
      }
    }

    const fails = rows.filter((r) => r.status === "fail").length;
    const warns = rows.filter((r) => r.status === "warn").length;
    const report = { at: now(), kit: ctx.kit.root, project: project?.dir ?? null, platform: `${process.platform} ${process.arch}`, node: process.versions.node, fails, warns, rows, capture: captureResult };
    if (opts.json) console.log(JSON.stringify(report, null, 2));
    else {
      printTable(rows, ["check", "status", "detail"]);
      console.log(`\ndoctor: ${fails} fail(s), ${warns} warning(s)`);
    }
    const out = opts.out ?? join(project?.dir ?? process.cwd(), "doctor.json");
    if (!opts.out && !project && insideKit(out)) ctx.log.info("(doctor.json not written: the current directory is the kit, which is never written to; pass --out)");
    else {
      writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
      if (!opts.json) ctx.log.info(`report: ${out}`);
    }
    if (project) {
      project.state.doctor = { at: report.at, fails, warns };
      project.save();
    }
    return fails ? 1 : 0;
  },
};
