// walkthrough render [--name final] [--fps 60] [--no-captions] [--no-build] [build flags]: HyperFrames
// render with the disk policy, rebuilding first when the build on disk is not what these inputs make,
// sidecars copied beside the render, recorded in state.renders.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { num, parseArgs } from "../lib/args.mjs";
import { diskPolicy, GB, MIN_FREE_BYTES, spillEnv, withCaffeinate } from "../lib/disk.mjs";
import { announce, capture } from "../lib/exec.mjs";
import { buildInputs, builtInputs, inputChanges, runBuild, storyboardOf } from "../lib/film.mjs";
import { CliError, requireProject } from "../lib/project.mjs";
import { addCost, now, rel, sha256File } from "../lib/state.mjs";
import { fmtSeconds } from "../lib/table.mjs";

const HYPERFRAMES = "hyperframes@0.9.16";

const usage = `walkthrough render [--name final] [--fps 60] [--no-captions] [--no-build] [--placeholders] [--min-free <GB>]
                  [--aspect 16:9|9:16|1:1] [--fit-audio <placement.json> [--fit-gap <s>] [--fit-max <s>]]
                  [--brand <file>] [--takes <dir>] [render flags]

1. Disk policy (docs/CLI.md), before anything else: >= 5 GB (--min-free) free on the project volume
   renders locally; else, with a buffer configured and mounted with room, renders into
   <buffer>/<project>/render/ (TMPDIR and the HyperFrames frame cache there too) and copies the file
   back; else stops. On macOS the render runs under caffeinate -i.
2. Build first when the build on disk is not what this render asks for (unless --no-build): when
   index.html or cues.json is missing; when cues.json's captions flag differs from this render
   (--no-captions wants the voiceover twin); when the storyboard changed since the last recorded
   build; or when an input differs from the build's: the aspect (--aspect, FILM_ASPECT, the
   storyboard's look.aspect, the brand's, else 16:9; the built one is read from index.html), the
   fit-audio placement (--fit-audio or the storyboard's fitAudio: on/off, file, sha256, gap, max),
   the brand file (path and sha256) or the takes folder. It prints each input that changed. The
   build flags (--aspect, --fit-audio, --fit-gap, --fit-max, --brand, --takes, --no-captions,
   --placeholders) go to that build, as in \`walkthrough build\`; give render the flags you built
   with (or keep them in the storyboard), else it rebuilds to match what the inputs say now.
   With --no-build it renders what is there and warns about each input that differs.
3. npx --yes ${HYPERFRAMES} render -o renders/<name>.mp4 --fps <fps>   (in the project; other flags pass through)
4. Copies cues.json, edl.json, captions.srt to renders/<name>.cues.json / .edl.json / .captions.srt
   (the sound build and the voiceover tools read those), reads duration and fps with ffprobe, and
   appends { name, file, at, fps, duration, captions, storyboardHash, seconds, spill } to state.renders
   plus a cost row (kind render, units = wall-clock minutes).
Exit code: the render's (or the build's, when the build fails).`;

function probe(file) {
  const r = capture("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=avg_frame_rate,r_frame_rate:format=duration", "-of", "json", file]);
  if (r.code !== 0) return { duration: null, fps: null };
  const j = JSON.parse(r.stdout);
  const rate = j.streams?.[0]?.avg_frame_rate || j.streams?.[0]?.r_frame_rate || "0/1";
  const [a, b] = rate.split("/").map(Number);
  return { duration: Number(j.format?.duration ?? NaN), fps: b ? Math.round((a / b) * 1000) / 1000 : null };
}

export default {
  name: "render",
  describe: "render the film (HyperFrames) with the disk policy; copies the sidecars, records the render",
  usage,
  async run(argv, ctx) {
    const project = requireProject(ctx);
    const { opts, unknown } = parseArgs(argv, {
      boolean: ["captions", "build", "placeholders"],
      string: ["name", "fps", "min-free", "aspect", "fit-audio", "fit-gap", "fit-max", "brand", "takes"],
    });
    const name = opts.name ?? "final";
    if (!/^[\w.-]+$/.test(name)) throw new CliError(`--name must be a plain file name (got "${name}")`, 2);
    const fps = opts.fps === undefined ? 60 : num(opts.fps, "fps");
    if (opts["fit-gap"] !== undefined) num(opts["fit-gap"], "fit-gap");
    if (opts["fit-max"] !== undefined) num(opts["fit-max"], "fit-max");
    const sb = storyboardOf(project);
    const P = project.dir;
    let sbCaptions = true;
    try {
      sbCaptions = JSON.parse(readFileSync(sb, "utf8")).captions !== false;
    } catch {}
    // a storyboard with "captions": false builds captionless whatever the flag says
    const wantCaptions = opts.captions !== false && sbCaptions;
    const buildFlags = { brand: opts.brand, takes: opts.takes, aspect: opts.aspect, fitAudio: opts["fit-audio"], fitGap: opts["fit-gap"], fitMax: opts["fit-max"] };
    // resolved before the disk policy, so a bad --aspect stops here
    const wanted = await buildInputs(project, buildFlags);

    // ---- disk policy first: stop before building or rendering anything
    const needBytes = opts["min-free"] === undefined ? MIN_FREE_BYTES : num(opts["min-free"], "min-free") * GB;
    const plan = diskPolicy(ctx, { step: "render", needBytes });
    project.save();

    // ---- build when the build on disk is not what this render asks for
    const hash = sha256File(sb);
    const built = builtInputs(project);
    let cuesCaptions = null;
    try {
      cuesCaptions = JSON.parse(readFileSync(join(P, "cues.json"), "utf8")).captions !== false;
    } catch {}
    const reasons = [];
    if (!existsSync(join(P, "index.html")) || cuesCaptions === null) reasons.push("no build yet");
    else {
      if (cuesCaptions !== wantCaptions) reasons.push(wantCaptions ? "the last build was the captionless twin" : "the voiceover twin (--no-captions): the last build had captions");
      if (built.storyboardHash && built.storyboardHash !== hash) reasons.push("the storyboard changed since the last build");
      reasons.push(...inputChanges(built, wanted));
    }
    if (opts.build !== false) {
      if (reasons.length) {
        ctx.log.info(`render: building first: ${reasons.join("; ")}`);
        const b = await runBuild(ctx, { ...buildFlags, noCaptions: opts.captions === false, placeholders: Boolean(opts.placeholders) });
        if (b.code !== 0) return b.code;
      } else ctx.log.info(`render: the build is current (aspect ${wanted.aspect}, captions ${wantCaptions ? "on" : "off"}${wanted.fitAudio ? `, fit-audio ${wanted.fitAudio.file}` : ""}); not rebuilding`);
    } else {
      if (!existsSync(join(P, "index.html"))) throw new CliError("no index.html: build first (`walkthrough build`) or drop --no-build");
      if (reasons.length) ctx.log.warn(`render --no-build: rendering the build on disk, which differs from these inputs: ${reasons.join("; ")}`);
    }

    const local = join(P, "renders", `${name}.mp4`);
    mkdirSync(join(P, "renders"), { recursive: true });
    const out = plan.action === "spill" ? join(plan.workDir, `${name}.mp4`) : `renders/${name}.mp4`;

    // ---- render
    const w = withCaffeinate("npx", ["--yes", HYPERFRAMES, "render", "-o", out, "--fps", String(fps), ...unknown]);
    const t0 = Date.now();
    const r = await ctx.exec(w.cmd, w.args, { cwd: P, env: spillEnv(plan) });
    const seconds = Math.round((Date.now() - t0) / 100) / 10;
    if (r.code !== 0) return r.code;
    if (plan.action === "spill") {
      announce("cp", [out, local]);
      copyFileSync(out, local);
    }
    if (!existsSync(local)) throw new CliError(`the render finished but ${local} is missing`);

    // ---- sidecars, probe, state
    for (const [src, suffix] of [["cues.json", "cues.json"], ["edl.json", "edl.json"], ["captions.srt", "captions.srt"]]) {
      const from = join(P, src);
      const to = join(P, "renders", `${name}.${suffix}`);
      if (!existsSync(from)) {
        ctx.log.warn(`${src} not found; renders/${name}.${suffix} not written`);
        continue;
      }
      announce("cp", [from, to]);
      copyFileSync(from, to);
    }
    const info = probe(local);
    let cuesDuration = null;
    try {
      cuesDuration = JSON.parse(readFileSync(join(P, "cues.json"), "utf8")).duration;
    } catch {}
    if (cuesDuration && info.duration && Math.abs(cuesDuration - info.duration) > 1 / fps + 0.001)
      ctx.log.warn(`render is ${info.duration.toFixed(3)} s but cues.json says ${cuesDuration.toFixed(3)} s: the sound build will refuse it`);
    let captions = wantCaptions;
    try {
      captions = JSON.parse(readFileSync(join(P, "cues.json"), "utf8")).captions !== false;
    } catch {}
    const entry = {
      name,
      file: rel(P, local),
      at: now(),
      fps: info.fps,
      duration: info.duration,
      bytes: statSync(local).size,
      captions,
      storyboardHash: sha256File(sb),
      seconds,
      caffeinated: w.caffeinated,
      spill: plan.action === "spill" ? plan.workDir : null,
    };
    project.state.renders.push(entry);
    addCost(project.state, { kind: "render", units: Math.round((seconds / 60) * 100) / 100, note: `render ${name} (wall-clock minutes)` });
    project.save();
    ctx.log.info(`\nrendered ${entry.file}: ${fmtSeconds(info.duration)} at ${info.fps} fps, captions ${captions ? "on" : "off"}, ${seconds} s wall clock; sidecars renders/${name}.{cues.json,edl.json,captions.srt}`);
    return 0;
  },
};
