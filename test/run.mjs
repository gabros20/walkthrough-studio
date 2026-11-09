// Golden test for the film build: a small fixture storyboard over an 8 s trim of the sample take,
// built with `film/build.mjs --dry --dry-out` and `--emit-only`, compared with test/golden/.
//
//   node test/run.mjs              compare (exit 1 on any difference, with a unified diff)
//   node test/run.mjs --update     rewrite test/golden/ and show what changed (npm run test:update)
//   node test/run.mjs --render     also render the fixture at 15 fps with HyperFrames and compare eight
//                                  frames by perceptual hash (local only: needs Chromium and fonts;
//                                  --render --update rewrites test/golden/frames.json)
//   node test/run.mjs --keep       keep the temporary folder and print its path
//
// Compared: edl.json, cues.json, captions.srt (byte for byte), and the SHA-256 of index.html and of
// every compositions/*.html (golden/compositions.json). kit.json is not compared (absolute paths).
// The take master is generated with ffmpeg (testsrc2, 2880x1620, 60 fps, the fixture's duration),
// so nothing binary is committed. Zero dependencies; needs node >= 22 and ffmpeg/ffprobe.
//
// Frame hashes (--render): ffmpeg scales each frame to 8x8 grey; the hash is one bit per pixel
// (above the mean). Two frames match when their hashes differ in at most HAMMING_TOLERANCE of the 64
// bits: 6 absorbs font hinting and encoder noise between machines, while a moved window, caption
// or pointer flips well over 10.

import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HAMMING_TOLERANCE = 6;
const FRAME_TIMES = [1.0, 2.6, 3.4, 4.2, 4.55, 5.75, 6.3, 8.4]; // film seconds: title, scene a (framed, spotlight, fade), the bridge, scene b, end
const HYPERFRAMES = "hyperframes@0.9.16";

const here = dirname(fileURLToPath(import.meta.url));
const root = dirname(here);
const fixture = join(here, "fixtures/brightpost-mini");
const golden = join(here, "golden");
const build = join(root, "film/build.mjs");
const args = new Set(process.argv.slice(2));
const UPDATE = args.has("--update"), RENDER = args.has("--render"), KEEP = args.has("--keep");

// a clean environment: no film or take overrides leak in from the shell
const env = { ...process.env };
for (const k of ["FILM_FPS", "FILM_ASPECT", "FILM_PROJECT", "FILM_BRAND", "WALKTHROUGH_TAKES", "WALKTHROUGH_PROJECT"]) delete env[k];

const tmp = mkdtempSync(join(tmpdir(), "walkthrough-golden-"));
const project = join(tmp, "project"), takes = join(tmp, "takes"), dry = join(tmp, "dry");
const failures = [];
const log = (m) => console.log(m);

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { encoding: "utf8", env, maxBuffer: 1 << 26, ...opts });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) throw new Error(`${cmd} ${argv.join(" ")} exited ${r.status}\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

/** A unified diff of two texts (system diff; a line list when it is missing). */
function udiff(label, a, b) {
  const fa = join(tmp, "diff-a"), fb = join(tmp, "diff-b");
  writeFileSync(fa, a);
  writeFileSync(fb, b);
  const r = spawnSync("diff", ["-u", "--label", `golden/${label}`, "--label", `build/${label}`, fa, fb], { encoding: "utf8" });
  if (!r.error) return r.stdout;
  const la = a.split("\n"), lb = b.split("\n");
  return la.map((l, i) => (l === lb[i] ? null : `-${l}\n+${lb[i] ?? ""}`)).filter(Boolean).join("\n");
}

const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

try {
  // ---------- inputs: the project and the take folder ----------
  mkdirSync(join(project, "assets/creatives"), { recursive: true });
  for (const f of ["storyboard.json", "brand.json"]) copyFileSync(join(fixture, f), join(project, f));
  copyFileSync(join(fixture, "creatives.manifest.json"), join(project, "assets/creatives/manifest.json"));
  cpSync(join(fixture, "takes"), takes, { recursive: true });
  for (const name of readdirSync(takes)) {
    const ev = JSON.parse(readFileSync(join(takes, name, "events.json"), "utf8"));
    const { width, height, duration, frames } = ev.video;
    const master = join(takes, name, ev.video.file ?? "master.mp4");
    run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `testsrc2=s=${width}x${height}:r=${ev.fps}:d=${duration}`,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "30", "-pix_fmt", "yuv420p", "-g", String(ev.fps), master]);
    const got = Number(run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", master]).trim());
    if (got !== frames) failures.push(`fixture take ${name}: generated master has ${got} frames, events.json video.frames says ${frames}`);
  }

  // ---------- the two builds ----------
  const common = [join(project, "storyboard.json"), "--project", project, "--takes", takes];
  const dryOut = run(process.execPath, [build, ...common, "--dry", "--dry-out", dry], { cwd: tmp });
  const emitOut = run(process.execPath, [build, ...common, "--emit-only"], { cwd: tmp });
  const pointerLines = dryOut.split("\n").filter((l) => l.startsWith("pointer: "));
  if (!pointerLines.some((l) => l.startsWith("pointer: bridge"))) failures.push("the build printed no pointer bridge line (expected one at the a→b cut)");
  if (!pointerLines.some((l) => l.startsWith("pointer: fade"))) failures.push("the build printed no pointer fade line (expected one inside scene a)");
  if (!emitOut.includes("--emit-only")) failures.push("--emit-only build did not report itself");
  if (existsSync(join(project, "assets/footage"))) failures.push("--emit-only cut footage (assets/footage exists)");

  // the dry run and the emit-only build must agree on the data files
  const DATA = ["edl.json", "cues.json", "captions.srt"];
  for (const f of DATA) {
    const a = readFileSync(join(dry, f), "utf8"), b = readFileSync(join(project, f), "utf8");
    if (a !== b) failures.push(`${f}: --dry and --emit-only differ\n${udiff(f, a, b)}`);
  }
  // nothing machine-specific in what is compared
  const outputs = [...DATA.map((f) => join(project, f)), join(project, "index.html"), ...readdirSync(join(project, "compositions")).filter((f) => f.endsWith(".html")).map((f) => join(project, "compositions", f))];
  for (const f of outputs) {
    const text = readFileSync(f, "utf8");
    for (const leak of [tmp, root, tmpdir()]) if (text.includes(leak)) failures.push(`${f.slice(project.length + 1)} contains a machine path (${leak})`);
  }

  // ---------- compare with (or write) the goldens ----------
  const comps = {};
  for (const f of outputs.filter((p) => p.endsWith(".html"))) comps[f.slice(project.length + 1)] = sha(f);
  const compsJson = JSON.stringify(Object.fromEntries(Object.entries(comps).sort()), null, 2) + "\n";
  const now = { ...Object.fromEntries(DATA.map((f) => [f, readFileSync(join(dry, f), "utf8")])), "compositions.json": compsJson };

  if (UPDATE) {
    mkdirSync(golden, { recursive: true });
    let changed = 0;
    for (const [f, text] of Object.entries(now)) {
      const p = join(golden, f);
      const old = existsSync(p) ? readFileSync(p, "utf8") : "";
      if (old === text) continue;
      changed++;
      log(udiff(f, old, text));
      writeFileSync(p, text);
    }
    log(changed ? `golden: ${changed} file(s) rewritten in test/golden/` : "golden: unchanged");
  } else {
    for (const [f, text] of Object.entries(now)) {
      const p = join(golden, f);
      if (!existsSync(p)) { failures.push(`test/golden/${f} is missing (run npm run test:update)`); continue; }
      const old = readFileSync(p, "utf8");
      if (old === text) continue;
      if (f === "compositions.json") {
        const g = JSON.parse(old);
        const names = [...new Set([...Object.keys(g), ...Object.keys(comps)])].filter((k) => g[k] !== comps[k]);
        failures.push(`compositions changed: ${names.join(", ")} (rebuild with --keep and inspect, or npm run test:update when the change is intended)`);
      } else failures.push(`${f} differs from test/golden/${f}\n${udiff(f, old, text)}`);
    }
  }

  // ---------- --render: real build, 15 fps render, eight frames by perceptual hash ----------
  if (RENDER) {
    run(process.execPath, [join(root, "film/scripts/make-placeholder.mjs"), "1", "--creatives", "--project", project], { cwd: tmp });
    run(process.execPath, [build, ...common], { cwd: tmp });
    const out = join(project, "renders/golden.mp4");
    run("npx", ["--yes", HYPERFRAMES, "render", "-o", out, "--fps", "15", "--quality", "draft"], { cwd: project, stdio: ["ignore", "pipe", "inherit"] });
    const hashes = FRAME_TIMES.map((t) => {
      const raw = execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", String(t), "-i", out, "-frames:v", "1", "-vf", "scale=8:8:flags=area,format=gray", "-f", "rawvideo", "-"]);
      const px = [...raw.subarray(0, 64)];
      const mean = px.reduce((a, v) => a + v, 0) / 64;
      return BigInt("0b" + px.map((v) => (v > mean ? "1" : "0")).join("")).toString(16).padStart(16, "0");
    });
    const fp = join(golden, "frames.json");
    if (UPDATE) { writeFileSync(fp, JSON.stringify({ tolerance: HAMMING_TOLERANCE, frames: FRAME_TIMES.map((t, i) => ({ t, hash: hashes[i] })) }, null, 2) + "\n"); log("golden: frames.json rewritten"); }
    else if (!existsSync(fp)) failures.push("test/golden/frames.json is missing (run node test/run.mjs --render --update)");
    else {
      const g = JSON.parse(readFileSync(fp, "utf8"));
      g.frames.forEach((f, i) => {
        let x = BigInt("0x" + f.hash) ^ BigInt("0x" + hashes[i]), d = 0;
        for (; x; x >>= 1n) d += Number(x & 1n);
        if (d > HAMMING_TOLERANCE) failures.push(`frame at ${f.t} s: hash ${hashes[i]} is ${d} bits from golden ${f.hash} (tolerance ${HAMMING_TOLERANCE})`);
      });
      log(`render: ${g.frames.length} frames compared`);
    }
  }
} catch (e) {
  failures.push(e.message);
} finally {
  if (KEEP) log(`kept ${tmp}`);
  else rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`golden test: ${failures.length} failure(s)\n\n${failures.join("\n\n")}`);
  process.exit(1);
}
log(`golden test: ok${UPDATE ? " (updated)" : ""}`);
