// walkthrough deliver --preset sales|web|social|docs: delivery/run_preset.py on the project's renders,
// under the disk policy, recorded in state.deliveries.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
import { num, parseArgs } from "../lib/args.mjs";
import { reclaimable } from "../lib/clean.mjs";
import { diskPolicy, GB } from "../lib/disk.mjs";
import { announce, quote } from "../lib/exec.mjs";
import { CliError, kitPath, requireProject } from "../lib/project.mjs";
import { now, rel } from "../lib/state.mjs";
import { fmtBytes, printTable } from "../lib/table.mjs";

const PRESETS = ["sales", "web", "social", "docs"];
// Free space wanted, as a multiple of the source films' size: sales copies the masters, encodes web copies,
// cuts two sets of clips and zips it all; the others write one smaller set. At least 1 GB.
const FACTOR = { sales: 6, web: 2, social: 2, docs: 3 };

const usage = `walkthrough deliver --preset sales|web|social|docs [--render final] [--vo-render final-vo|none]
                    [--video <file>] [--vo-video <file>] [--out out/<name>] [--config package.config.json]
                    [--product <name>] [--zip] [--burn | --no-burn] [--allow-silent] [--min-free <GB>]

Runs python3 -I <kit>/delivery/run_preset.py <preset> --project <project> [flags] in the project. It reads
renders/<render>.mp4 with its sidecars (.edl.json, .captions.srt, .cues.json) and the storyboard's scene groups,
prints every python/ffmpeg command it runs ("›"), writes MANIFEST.txt and runs delivery/verify.py.
  sales    the full package from package.config.json (generated from the renders when there is none), zipped
  web      1080p30 + 720p encodes, poster, .srt + .vtt, description.txt with YouTube chapters
  social   one clip per scene group, at most 60 s, captions burned in (renders/<render>-9x16.mp4 when it exists)
  docs     one clip per scene group (10-30 s) with its .srt, a GIF of at most 8 MB, a poster .jpg, and index.md
  --render       render name (default final); --vo-render: the voiceover twin (default final-vo when it exists)
  --video        the mixed film to use instead of renders/<render>.mp4 (the sound build's --deliver output)
  --out          output folder (default out/<Product>_<Preset>; sales: the config's "out")
  --zip          zip the result with delivery/zip.sh (sales always zips)
  --burn         burn captions even when the picture already carries them; --no-burn never burns
  --allow-silent accept a render without audio (test renders only; sales refuses silent masters)
  --min-free     free space needed, in GB (default: ${Object.entries(FACTOR).map(([k, v]) => `${k} ${v}x`).join(", ")} the films' size; at least 1 GB)
Disk policy: when the project volume is short and a buffer has room, the output is written on the buffer and
the zip is copied back to <project>/out/ (--zip is implied). Each run is appended to state.deliveries:
{ at, preset, render, out, zip, files, bytes, spilled, exit }.
At the end it lists what \`walkthrough clean --dry\` would free now and once the client accepts the film
(--all: checkpoints, raw frames, caches, buffer folders), with the exact line to run then. Nothing is
removed by deliver itself.
Presets and their numbers: delivery/presets.json; outputs: docs/DELIVERY.md.`;

const size = (p) => {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
};

export default {
  name: "deliver",
  describe: "delivery presets: sales package, web embed, social cuts, docs clips and GIFs",
  usage,
  async run(argv, ctx) {
    const project = requireProject(ctx);
    const { opts, positional, unknown } = parseArgs(argv, {
      boolean: ["zip", "burn", "allow-silent"],
      string: ["preset", "render", "vo-render", "video", "vo-video", "out", "config", "product", "min-free"],
    });
    const preset = opts.preset ?? positional[0];
    if (!PRESETS.includes(preset)) throw new CliError(`deliver needs --preset ${PRESETS.join("|")}\n\n${usage}`, 2);
    if (unknown.length) throw new CliError(`deliver: unknown flag(s) ${unknown.join(" ")}\n\n${usage}`, 2);
    const P = project.dir;
    const render = opts.render ?? "final";
    const inProject = (p) => (isAbsolute(p) ? p : join(P, p));
    const shown = (p) => (p && p.startsWith(P + "/") ? rel(P, p) : p);

    // ---- disk policy before anything is written
    const sources = [opts.video ? inProject(opts.video) : join(P, "renders", `${render}.mp4`)];
    if (opts["vo-render"] !== "none")
      sources.push(opts["vo-video"] ? inProject(opts["vo-video"]) : join(P, "renders", `${opts["vo-render"] ?? "final-vo"}.mp4`));
    const filmBytes = sources.reduce((a, p) => a + size(p), 0);
    const needBytes = opts["min-free"] !== undefined ? num(opts["min-free"], "min-free") * GB : Math.max(GB, FACTOR[preset] * filmBytes);
    const plan = diskPolicy(ctx, { step: "deliver", needBytes });
    project.save();
    const spill = plan.action === "spill" && !opts.out;
    if (plan.action === "spill" && opts.out) ctx.log.warn(`--out ${opts.out} given: writing there, not to the buffer`);

    // ---- run the preset
    const tmp = mkdtempSync(join(tmpdir(), "walkthrough-deliver-"));
    const report = join(tmp, "report.json");
    const args = ["-I", kitPath("delivery/run_preset.py"), preset, "--project", P, "--report", report];
    for (const k of ["render", "vo-render", "video", "vo-video", "out", "config", "product"]) if (opts[k]) args.push(`--${k}`, opts[k]);
    if (spill) args.push("--out-root", plan.workDir);
    if (opts.zip || spill) args.push("--zip");
    if (opts.burn === true) args.push("--burn");
    if (opts.burn === false) args.push("--no-burn");
    if (opts["allow-silent"]) args.push("--allow-silent");
    const r = await ctx.exec("python3", args, { cwd: P, env: { WALKTHROUGH_ECHO: "1" } });
    let rep = null;
    try {
      rep = JSON.parse(readFileSync(report, "utf8"));
    } catch {}
    rmSync(tmp, { recursive: true, force: true });

    // ---- spilled: bring the zip home; the unzipped folder stays on the buffer
    let zip = rep?.zip ?? null;
    if (spill && zip && existsSync(zip)) {
      mkdirSync(join(P, "out"), { recursive: true });
      const home = join(P, "out", basename(zip));
      announce("cp", [zip, home]);
      copyFileSync(zip, home);
      zip = home;
      ctx.log.info(`the unzipped folder stays on the buffer: ${rep.out}`);
    }

    // ---- record and summarise
    const entry = {
      at: now(),
      preset,
      render,
      out: shown(rep?.out ?? null),
      zip: shown(zip),
      files: rep?.files ?? null,
      bytes: rep?.bytes ?? null,
      spilled: spill ? plan.workDir : null,
      exit: r.code,
    };
    project.state.deliveries.push(entry);
    project.save();
    if (rep) {
      console.log("");
      printTable(
        Object.entries(rep.folders).map(([folder, [files, bytes]]) => ({ folder: folder === "." ? "(top level)" : `${folder}/`, files, size: fmtBytes(bytes) })),
        ["folder", { key: "files", align: "right" }, { key: "size", align: "right" }],
      );
      ctx.log.info(`\ndeliver ${preset}: ${rep.files} files, ${fmtBytes(rep.bytes)} in ${entry.out}${zip ? `; zip ${entry.zip} (${fmtBytes(rep.zipBytes)})` : ""}; recorded in state.deliveries`);
    } else ctx.log.warn(`deliver ${preset} did not finish (exit ${r.code}); recorded in state.deliveries`);

    // ---- what the project still holds that it will not need once the film is accepted
    if (r.code === 0) {
      const projectFlag = process.cwd() === P ? "" : ` --project ${quote(P)}`;
      announce("walkthrough", ["clean", "--dry", "--all", ...(projectFlag ? ["--project", P] : [])]);
      try {
        const inv = await reclaimable(project);
        const n = inv.now.totals.remove, a = inv.all.totals.remove;
        ctx.log.info(
          `\nreclaimable: ${fmtBytes(n.onDisk)} on disk now (${n.count} item(s); \`walkthrough clean --dry\` lists them)` +
            `\nonce the client accepts the film: ${fmtBytes(a.onDisk)} on disk, logical ${fmtBytes(a.logical)} (${a.count} item(s): checkpoints, raw frames, caches, buffer folders). Then run:` +
            `\n  walkthrough clean --all --yes${projectFlag}`,
        );
      } catch (err) {
        ctx.log.warn(`could not list what is reclaimable (${String(err?.message ?? err).split("\n")[0]}); run walkthrough clean --dry`);
      }
    }
    return r.code;
  },
};
