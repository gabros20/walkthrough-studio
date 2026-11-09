#!/usr/bin/env node
// The review bundle: one folder per render with everything the critic and the human look at, and a
// static review page (docs/REVIEW.md; design: docs/DESIGN-batch-2.md §7).
//
//   node <kit>/film/scripts/review-bundle.mjs <renders/name.mp4> [--out review/<name>] [--project dir]
//        [--storyboard storyboard.json] [--takes dir] [--sound-build sound-build/] [--state state.json]
//        [--placement voiceover/placement.json] [--fps-sheet 1] [--width 320] [--hold 1.0]
//        [--labels auto|drawtext|pillow|none] [--json]
//
// Reads the render and its sidecars renders/<name>.{cues,edl}.json and renders/<name>.captions.srt
// (written by `walkthrough render`, or copied by hand after a render: film/README.md). The project is
// --project, else the folder above renders/. Writes into --out (default <project>/review/<name>):
//
//   sheets/<scene>.jpg     a contact sheet per scene (title and end included): one frame every
//                          1/--fps-sheet s of film inside the scene's span from edl.json, each tile
//                          stamped with its film time
//   cuts/<nn>-<t>.jpg      3 frames before and 3 after every cut and transition in cues.json, and every
//                          cut inside a scene (edl.json ranges that do not follow on); the first frame
//                          after the cut is marked
//   audit.json, audit.md   film/scripts/audit.mjs --json on the sidecars: pointer jumps at cuts, dead
//                          air, caption lint, caption claims (exit code and errors kept)
//   holds.md               film/scripts/holds.py, when the project's current build is this render's
//                          (same edl.json, the cut clips and compositions present); else skipped, saying why
//   audio.md               when a sound build exists: integrated loudness, range and true peak of the
//                          mix (ffmpeg ebur128) and of the render's own audio track; per-line voice over
//                          music from the sound build's report (its voice and music before the mix), or,
//                          without one, the mix inside each placed line vs outside every line (a proxy)
//   costs.md               the cost ledger from state.json (when it has rows)
//   REVIEW.md              film facts, what was measured (links), what was not, the critic checklist from
//                          skills/review-film as unchecked boxes, an empty Rulings section
//   index.html             a static page (no server, no network, works from file://): the render in a
//                          <video>, every finding with a time that seeks it, the sheets and strips (click
//                          a tile to seek), a note and a ruling per finding, timed notes, free notes, and
//                          "Export notes" -> review-notes.json (a download; nothing is sent anywhere)
//   bundle.json            what was written, measured and skipped (the CLI reads it)
//
// --fps-sheet is frames per second of film on the sheets (1 = one a second, 0.5 = one every 2 s);
// --width the tile width in px. Labels: ffmpeg drawtext when the build has it, else Pillow
// (python3 -I film/scripts/review/tile.py), else unlabelled tiles (REVIEW.md and the page say so);
// --labels forces one. Needs node, ffmpeg and ffprobe; Python 3 with
// numpy for holds, Pillow for labels without drawtext. Exit 0 when the bundle is written (findings do
// not fail it), 1 on bad input.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const KIT = resolve(HERE, "../..");
const ASSETS = join(HERE, "review");

// ---------------- arguments ----------------
const argv = process.argv.slice(2);
const VALUED = new Set(["--out", "--project", "--storyboard", "--takes", "--sound-build", "--state", "--placement", "--fps-sheet", "--width", "--hold", "--labels"]);
const opts = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const eq = a.indexOf("=");
  const key = a.startsWith("--") && eq > 0 ? a.slice(0, eq) : a;
  if (VALUED.has(key)) opts[key.slice(2)] = eq > 0 && a.startsWith("--") ? a.slice(eq + 1) : argv[++i];
  else if (a === "--json" || a === "--help" || a === "-h") opts[a.replace(/^-+/, "")] = true;
  else if (a.startsWith("--")) die(`unknown option ${a} (--help lists them)`, 1);
  else positional.push(a);
}
if (opts.help || opts.h) {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  console.log(src.slice(1, src.findIndex((l) => l.startsWith("import "))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n").trim());
  process.exit(0);
}
function die(msg, code = 1) {
  console.error(`review-bundle: ${msg}`);
  process.exit(code);
}
const num = (v, name, def) => {
  if (v === undefined) return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) die(`--${name} must be a positive number (got "${v}")`);
  return n;
};
if (!positional[0]) die("usage: review-bundle.mjs <renders/name.mp4> [--out dir] ... (--help)");
const RENDER = resolve(positional[0]);
if (!existsSync(RENDER)) die(`no render at ${RENDER}`);
const FPS_SHEET = num(opts["fps-sheet"], "fps-sheet", 1);
const TILE_W = Math.round(num(opts.width, "width", 320) / 2) * 2;
const HOLD = num(opts.hold, "hold", 1.0);

// <name>.mp4, or <name>.picture-only.mp4 (what the sound build leaves after a delivery)
const NAME = basename(RENDER).replace(/\.mp4$/i, "").replace(/\.picture-only$/, "");
const RDIR = dirname(RENDER);
const P = opts.project ? resolve(opts.project) : basename(RDIR) === "renders" ? dirname(RDIR) : RDIR;
if (!existsSync(P) || !statSync(P).isDirectory()) die(`no project folder at ${P} (pass --project)`);
const OUT = resolve(opts.out ?? join(P, "review", NAME));
if (OUT === KIT || OUT.startsWith(KIT + sep)) die(`--out ${OUT} is inside the kit: the bundle belongs in the project (ADR-007)`);
const relP = (p) => { const r = relative(P, p); return r && !r.startsWith("..") ? r : p; };
const relOut = (p) => relative(OUT, p).split(sep).join("/");

const measured = []; // { what, file } for REVIEW.md
const skipped = []; // plain sentences
const log = (m) => console.log(m);

// ---------------- sidecars ----------------
function sidecar(suffix, live) {
  const s = join(RDIR, `${NAME}.${suffix}`);
  if (existsSync(s)) return { path: s, from: "sidecar" };
  return live && existsSync(join(P, live)) ? { path: join(P, live), from: "live" } : null;
}
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
let cuesF = sidecar("cues.json", "cues.json");
let edlF = sidecar("edl.json", "edl.json");
const srtF = sidecar("captions.srt", "captions.srt");
if (!cuesF || !edlF) die(`no ${NAME}.cues.json / ${NAME}.edl.json beside the render and none in the project: copy the sidecars after rendering (film/README.md)`);
const cues = readJson(cuesF.path);
const edl = readJson(edlF.path);

// ---------------- probe ----------------
function probe(file) {
  const r = spawnSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8" });
  if (r.error) die("ffprobe not found: install ffmpeg (docs/INSTALL.md)");
  if (r.status !== 0) die(`ffprobe could not read ${file}: ${(r.stderr || "").trim().split("\n").pop()}`);
  const j = JSON.parse(r.stdout);
  const v = (j.streams ?? []).find((s) => s.codec_type === "video");
  const a = (j.streams ?? []).find((s) => s.codec_type === "audio");
  const [n, d] = String(v?.avg_frame_rate || v?.r_frame_rate || "0/1").split("/").map(Number);
  return { width: v?.width ?? null, height: v?.height ?? null, fps: d ? Math.round((n / d) * 1000) / 1000 : null, duration: Number(j.format?.duration ?? NaN), audio: Boolean(a), audioCodec: a?.codec_name ?? null, bytes: Number(j.format?.size ?? 0) };
}
const info = probe(RENDER);
const FPS = info.fps || edl.fps || cues.fps || 30;
const DUR = Number.isFinite(info.duration) ? info.duration : cues.duration;
const frame = 1 / FPS;
for (const [label, f] of [["cues.json", cuesF], ["edl.json", edlF]])
  if (f.from === "live") {
    if (Math.abs((cues.duration ?? 0) - DUR) > frame + 0.001) die(`no ${NAME}.${label} beside the render, and the project's live ${label} is for a ${Number(cues.duration).toFixed(3)} s film (the render is ${DUR.toFixed(3)} s): copy the sidecars after rendering`);
    skipped.push(`No \`${NAME}.${label}\` sidecar beside the render: the project's live \`${label}\` was used (its length matches the render).`);
  }
if (Math.abs((cues.duration ?? DUR) - DUR) > frame + 0.001) skipped.push(`The render is ${DUR.toFixed(3)} s but cues.json says ${Number(cues.duration).toFixed(3)} s: times below may be off; re-copy the sidecars from the build this render came from.`);
const CAPTIONS = cues.captions !== false;

// ---------------- labels ----------------
const FONTS = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf"];
const fontFile = FONTS.find((f) => existsSync(f)) ?? null;
const hasFilter = (name) => {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-filters"], { encoding: "utf8" });
  if (r.error) die("ffmpeg not found: install ffmpeg (docs/INSTALL.md)");
  return new RegExp(`^\\s*\\S+\\s+${name}\\s`, "m").test(r.stdout);
};
const pillow = () => spawnSync("python3", ["-I", "-c", "import PIL"], { encoding: "utf8" }).status === 0;
const LABELS_WANT = opts.labels ?? "auto";
if (!["auto", "drawtext", "pillow", "none"].includes(LABELS_WANT)) die(`--labels must be auto, drawtext, pillow or none (got "${LABELS_WANT}")`);
if (LABELS_WANT === "drawtext" && !hasFilter("drawtext")) die("--labels drawtext: this ffmpeg has no drawtext filter");
if (LABELS_WANT === "pillow" && !pillow()) die("--labels pillow: python3 -I cannot import PIL (pip install pillow)");
const LABELS = LABELS_WANT !== "auto" ? LABELS_WANT : hasFilter("drawtext") ? "drawtext" : pillow() ? "pillow" : "none";
if (LABELS === "none") skipped.push(LABELS_WANT === "none" ? "Sheet and strip tiles are **unlabelled** (--labels none). The page still seeks from a clicked tile." : "Sheet and strip tiles are **unlabelled**: this ffmpeg has no `drawtext` and Python has no Pillow (`pip install pillow`, or an ffmpeg built with libfreetype). The page still seeks from a clicked tile.");

// ---------------- helpers ----------------
const fmt = (t) => {
  const m = Math.floor(t / 60);
  return `${m}:${(t - m * 60).toFixed(2).padStart(5, "0")}`;
};
const run = (cmd, args, o = {}) =>
  new Promise((done) => {
    const c = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...o });
    let out = "", err = "";
    c.stdout.on("data", (b) => (out += b));
    c.stderr.on("data", (b) => (err += b));
    c.on("error", (e) => done({ code: 127, out, err: err + e.message }));
    c.on("close", (code) => done({ code: code ?? 1, out, err }));
  });
async function pool(items, n, fn) {
  const results = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      results[k] = await fn(items[k], k);
    }
  }));
  return results;
}
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/%/g, "\\%");
const lastFrameT = Math.max(0, DUR - frame);

/** Extract one frame (accurate seek) at film time t to file; drawtext label / mark bar when available. */
async function grab(t, file, { label, mark }) {
  const vf = [`scale=${TILE_W}:-2`];
  if (mark && LABELS !== "pillow") vf.push(`drawbox=x=0:y=0:w=${Math.max(4, Math.round(TILE_W / 80))}:h=ih:color=0xFF8C00:t=fill`);
  if (LABELS === "drawtext" && label) {
    const size = Math.max(14, Math.round(TILE_W / 18));
    vf.push(`drawtext=${fontFile ? `fontfile='${esc(fontFile)}':` : ""}text='${esc(label)}':x=5:y=4:fontsize=${size}:fontcolor=yellow:box=1:boxcolor=black:boxborderw=4`);
  }
  const r = await run("ffmpeg", ["-v", "error", "-y", "-ss", t.toFixed(4), "-i", RENDER, "-frames:v", "1", "-vf", vf.join(","), "-q:v", "3", file]);
  return r.code === 0 && existsSync(file) ? file : null;
}

/** Tile frames (in order) into one sheet. Returns { file, cols, gap, times } or null. */
async function sheet(tiles, outFile, work, cols) {
  mkdirSync(work, { recursive: true });
  const got = await pool(tiles, 6, (t, i) => grab(t.t, join(work, `f${String(i + 1).padStart(4, "0")}.jpg`), t));
  const ok = tiles.map((t, i) => ({ ...t, file: got[i] })).filter((t) => t.file);
  if (!ok.length) return null;
  const c = Math.max(1, Math.min(cols, ok.length));
  const gap = 4;
  if (LABELS === "pillow") {
    const manifest = join(work, "manifest.json");
    writeFileSync(manifest, JSON.stringify({ out: outFile, cols: c, gap, tiles: ok.map((t) => ({ file: t.file, label: t.label, mark: Boolean(t.mark) })) }));
    const r = await run("python3", ["-I", join(ASSETS, "tile.py"), manifest]);
    if (r.code !== 0) { skipped.push(`Tiling ${relOut(outFile)} with Pillow failed: ${r.err.trim().split("\n").pop()}`); return null; }
  } else {
    // renumber the frames that exist so ffmpeg's image sequence has no holes
    const seq = join(work, "seq");
    mkdirSync(seq, { recursive: true });
    ok.forEach((t, i) => writeFileSync(join(seq, `s${String(i + 1).padStart(4, "0")}.jpg`), readFileSync(t.file)));
    const rows = Math.ceil(ok.length / c);
    const r = await run("ffmpeg", ["-v", "error", "-y", "-framerate", "1", "-start_number", "1", "-i", join(seq, "s%04d.jpg"), "-vf", `tile=${c}x${rows}:padding=${gap}:color=white`, "-frames:v", "1", "-q:v", "3", outFile]);
    if (r.code !== 0) { skipped.push(`Tiling ${relOut(outFile)} with ffmpeg failed: ${r.err.trim().split("\n").pop()}`); return null; }
  }
  return { file: relOut(outFile), cols: c, gap, times: ok.map((t) => Math.round(t.t * 1000) / 1000) };
}

// ---------------- 1. contact sheets per scene ----------------
const WORK = join(OUT, ".work");
rmSync(WORK, { recursive: true, force: true });
for (const d of ["sheets", "cuts"]) rmSync(join(OUT, d), { recursive: true, force: true });
mkdirSync(join(OUT, "sheets"), { recursive: true });
mkdirSync(join(OUT, "cuts"), { recursive: true });

const total = edl.durations?.total ?? cues.duration ?? DUR;
const spans = [];
if (edl.scenes?.length) {
  spans.push({ scene: "title", from: 0, to: edl.scenes[0].start });
  for (const s of edl.scenes) spans.push({ scene: s.id, from: s.start, to: s.start + s.duration });
  spans.push({ scene: "end", from: edl.scenes.at(-1).start + edl.scenes.at(-1).duration, to: total });
} else spans.push({ scene: "film", from: 0, to: total });
const safeName = (s) => String(s).replace(/[^\w.-]+/g, "_");
const sheets = [];
log(`review-bundle: ${relP(RENDER)} (${DUR.toFixed(2)} s, ${FPS} fps, ${info.width}x${info.height}, captions ${CAPTIONS ? "on" : "off"}) -> ${relP(OUT)}; labels: ${LABELS}`);
for (const [i, sp] of spans.entries()) {
  if (sp.to - sp.from < frame) continue;
  const times = [];
  const step = 1 / FPS_SHEET;
  for (let t = sp.from + Math.min(0.25, (sp.to - sp.from) / 2); t < sp.to - 0.05 || !times.length; t += step) {
    times.push(Math.min(t, lastFrameT));
    if (t >= sp.to) break;
  }
  const out = join(OUT, "sheets", `${safeName(sp.scene)}.jpg`);
  const s = await sheet(times.map((t) => ({ t, label: fmt(t) })), out, join(WORK, `sheet-${i}`), 6);
  if (s) sheets.push({ scene: sp.scene, from: sp.from, to: sp.to, ...s });
}
log(`  sheets: ${sheets.length} (one frame every ${(1 / FPS_SHEET).toFixed(2)} s)`);
measured.push({ what: `Contact sheet per scene (${sheets.length}), one frame every ${(1 / FPS_SHEET).toFixed(2)} s of film, ${LABELS === "none" ? "unlabelled" : "stamped with film time"}`, file: "sheets/" });

// ---------------- 2. strips around every cut and transition ----------------
const cutList = [];
for (const c of cues.cues ?? []) {
  if (c.type !== "transition") continue;
  const label = c.kind === "cut" ? `cut to ${c.to ?? "?"}` : c.kind === "wipe" ? `wipe (${c.where ?? ""})` : c.kind;
  cutList.push({ t: c.t, kind: c.kind, label });
}
for (const s of edl.scenes ?? []) {
  const rs = s.ranges ?? [];
  for (let k = 1; k < rs.length; k++) {
    if (Math.abs(rs[k - 1].srcOut - rs[k].srcIn) <= frame) continue;
    const t = s.start + rs[k].filmIn;
    if (cutList.some((c) => Math.abs(c.t - t) < 1.5 * frame)) continue;
    cutList.push({ t, kind: "cut", label: `cut inside ${s.id}${rs[k].montage || rs[k - 1].montage ? " (montage)" : ""}` });
  }
}
cutList.sort((a, b) => a.t - b.t);
const cuts = [];
for (const [i, c] of cutList.entries()) {
  const k = Math.round(c.t * FPS);
  const tiles = [];
  for (let j = k - 3; j <= k + 2; j++) {
    if (j < 0 || j / FPS > lastFrameT + 1e-6) continue;
    const t = Math.max(0, (j - 0.25) / FPS); // the first frame at or after this time is frame j
    tiles.push({ t, label: `${fmt(j / FPS)} ${j - k < 0 ? j - k : `+${j - k}`}`, mark: j === k });
  }
  const nn = String(i + 1).padStart(2, "0");
  const out = join(OUT, "cuts", `${nn}-${c.t.toFixed(2)}.jpg`);
  const s = await sheet(tiles, out, join(WORK, `cut-${i}`), 6);
  if (s) cuts.push({ n: i + 1, t: c.t, kind: c.kind, label: c.label, ...s, times: s.times.map((x) => Math.round((x + 0.25 / FPS) * 1000) / 1000), from: c.t });
}
log(`  cut strips: ${cuts.length}`);
measured.push({ what: `Strips of 3 frames before and 3 after each of ${cuts.length} cuts and transitions (cues.json transitions and cuts inside scenes); the first frame after the cut is marked`, file: "cuts/" });

// ---------------- 3. audit ----------------
const sbPath = opts.storyboard ? resolve(opts.storyboard) : join(P, "storyboard.json");
let audit = null;
const findings = [];
if (!existsSync(sbPath)) skipped.push(`Audit: no storyboard at \`${relP(sbPath)}\` (pass --storyboard).`);
else {
  const args = [join(KIT, "film/scripts/audit.mjs"), sbPath, "--project", P, "--edl", edlF.path, "--cues", cuesF.path, "--hold", String(HOLD), "--json"];
  if (srtF) args.push("--srt", srtF.path);
  if (opts.takes) args.push("--takes", resolve(opts.takes));
  const r = await run(process.execPath, args, { cwd: P });
  try {
    audit = JSON.parse(r.out);
    audit.exit = r.code;
  } catch {
    skipped.push(`Audit: \`film/scripts/audit.mjs\` failed (exit ${r.code}): ${(r.err || r.out).trim().split("\n").pop()}`);
  }
}
if (audit) {
  writeFileSync(join(OUT, "audit.json"), JSON.stringify(audit, null, 2) + "\n");
  const byCheck = {};
  for (const row of audit.rows) (byCheck[row.check] ??= []).push(row);
  const md = [
    `# Audit: ${NAME}`,
    "",
    `\`film/scripts/audit.mjs --json\` on \`${relP(edlF.path)}\`, \`${relP(cuesF.path)}\`${srtF ? `, \`${relP(srtF.path)}\`` : " (no captions .srt)"}: **${audit.errors} error(s), ${audit.warnings} warning(s)** (exit ${audit.exit}). Errors fail a build; warnings are rulings. Times are film seconds.`,
    "",
    "| check | error | warn | skip | ok |",
    "|---|--:|--:|--:|--:|",
    ...Object.entries(byCheck).map(([k, rows]) => `| ${k} | ${["error", "warn", "skip", "ok"].map((l) => rows.filter((x) => x.level === l).length).join(" | ")} |`),
    "",
  ];
  const TITLES = { jump: "Pointer jumps at cuts", captions: "Caption lint", "dead air": "Dead air after captions", claims: "Caption claims against the marked text", holds: "Holds", edl: "EDL" };
  for (const [k, rows] of Object.entries(byCheck)) {
    md.push(`## ${TITLES[k] ?? k}`, "", "| level | film s | scene | finding |", "|---|--:|---|---|");
    for (const x of rows) md.push(`| ${x.level} | ${x.film} | ${x.scene} | ${String(x.detail).replace(/\|/g, "\\|")} |`);
    if (k === "holds") md.push("", "The audit checks holds only on the project's own build; the bundle runs `holds.py` itself when the project's build is this render's: see holds.md, or REVIEW.md (Not measured) for why it did not.");
    md.push("");
  }
  if (!byCheck.jump) md.push("## Pointer jumps at cuts", "", `No pointer jump over the threshold at any cut.`, "");
  if (!byCheck.captions) md.push("## Caption lint", "", CAPTIONS ? "No caption lint finding." : "Captions are off in this render (the voiceover twin): nothing to lint.", "");
  writeFileSync(join(OUT, "audit.md"), md.join("\n"));
  audit.rows.forEach((x, i) => findings.push({ id: `a${i + 1}`, level: x.level, check: x.check, scene: x.scene || null, t: x.film === "" ? null : Number(x.film), detail: x.detail, source: "audit" }));
  measured.push({ what: `Build audit on the render's sidecars: pointer jumps at cuts, dead air, caption lint, caption claims: ${audit.errors} error(s), ${audit.warnings} warning(s)`, file: "audit.md" });
  log(`  audit: ${audit.errors} error(s), ${audit.warnings} warning(s)`);
}

// ---------------- 4. holds ----------------
function takesDir() {
  if (opts.takes) return resolve(opts.takes);
  if (process.env.WALKTHROUGH_TAKES) return resolve(process.env.WALKTHROUGH_TAKES);
  try {
    const sb = readJson(sbPath);
    if (sb.takesDir) return isAbsolute(sb.takesDir) ? sb.takesDir : resolve(dirname(sbPath), sb.takesDir);
  } catch {}
  return existsSync(join(P, "takes")) ? join(P, "takes") : resolve(P, "../takes");
}
let holdsRows = null;
{
  const same = existsSync(join(P, "edl.json")) && readFileSync(join(P, "edl.json"), "utf8") === readFileSync(edlF.path, "utf8");
  const missing = (edl.scenes ?? []).find((s) => !existsSync(join(P, "compositions", `${s.id}.html`)) || !existsSync(join(P, "assets/footage", `${s.id}.mp4`)));
  const why = !existsSync(sbPath) ? "no storyboard" : !same ? "the project's current build (edl.json) is not this render's: rebuild the storyboard this render came from, then bundle again" : missing ? `needs a real build (no cut clip or composition for scene ${missing.id})` : !existsSync(join(P, "captions.srt")) ? "the project has no captions.srt (holds.py reads it)" : null;
  if (why) skipped.push(`Holds (\`film/scripts/holds.py\`): skipped, ${why}.`);
  else {
    const r = await run("python3", ["-I", join(KIT, "film/scripts/holds.py"), String(HOLD), sbPath, "--takes", takesDir()], { cwd: P });
    if (r.code !== 0) skipped.push(`Holds: \`holds.py\` failed: ${r.err.trim().split("\n").pop()} (it needs Python 3 with numpy).`);
    else {
      holdsRows = [];
      for (const line of r.out.split("\n")) {
        const m = /^(\S+)\s+film\s+([\d.]+)-\s*([\d.]+) \(([\d.]+) s\)\s+(.*)$/.exec(line);
        if (m) holdsRows.push({ scene: m[1], from: Number(m[2]), to: Number(m[3]), len: Number(m[4]), detail: m[5].replace(/\s+/g, " ") });
      }
      const md = [
        `# Holds: ${NAME}`,
        "",
        `\`python3 -I film/scripts/holds.py ${HOLD} storyboard.json\` on the project's build (the same edl.json as this render): stretches longer than ${HOLD} s with no pointer move, no camera or overlay tween, no typing or scrolling and no UI change in the cut clip. Each one is deliberate (the moment is the point) or a trim.`,
        "",
        ...(holdsRows.length ? ["| scene | film from | to | still for | source span, kind, caption |", "|---|--:|--:|--:|---|", ...holdsRows.map((h) => `| ${h.scene} | ${h.from.toFixed(2)} | ${h.to.toFixed(2)} | ${h.len.toFixed(2)} s | ${h.detail.replace(/\|/g, "\\|")} |`)] : [`No hold longer than ${HOLD} s.`]),
        "",
        "Raw output:",
        "",
        "```",
        r.out.trim() || "(none)",
        "```",
        "",
      ];
      writeFileSync(join(OUT, "holds.md"), md.join("\n"));
      measured.push({ what: `Dead holds over ${HOLD} s (holds.py on the cut clips and compositions): ${holdsRows.length}`, file: "holds.md" });
      holdsRows.forEach((h, i) => findings.push({ id: `h${i + 1}`, level: "warn", check: "holds", scene: h.scene, t: h.from, detail: `${h.len.toFixed(2)} s still: ${h.detail}`, source: "holds" }));
      log(`  holds: ${holdsRows.length}`);
    }
  }
}
// the audit's own holds row only says it did not run on sidecars: drop it when holds.md exists
if (holdsRows) for (let i = findings.length - 1; i >= 0; i--) if (findings[i].source === "audit" && findings[i].check === "holds" && findings[i].level === "skip") findings.splice(i, 1);
const ORDER = { error: 0, warn: 1, skip: 2, ok: 3 };
findings.sort((a, b) => ORDER[a.level] - ORDER[b.level] || (a.t ?? 1e9) - (b.t ?? 1e9));

// ---------------- 5. audio ----------------
async function loudness(file, extra = []) {
  const r = await run("ffmpeg", ["-nostats", "-hide_banner", ...extra, "-i", file, "-map", "0:a:0", "-af", "ebur128=peak=true", "-f", "null", "-"]);
  const s = r.err.slice(r.err.lastIndexOf("Summary:"));
  const g = (re) => { const m = re.exec(s); return m ? Number(m[1]) : null; };
  if (r.code !== 0 || !/Summary:/.test(r.err)) return null;
  return { I: g(/I:\s+(-?[\d.]+) LUFS/), LRA: g(/LRA:\s+(-?[\d.]+) LU/), TP: g(/Peak:\s+(-?[\d.]+) dBFS/) };
}
/** Momentary loudness (400 ms windows) every 100 ms: [{ t (window centre), M }]. */
async function momentary(file) {
  const r = await run("ffmpeg", ["-nostats", "-hide_banner", "-v", "verbose", "-i", file, "-map", "0:a:0", "-af", "ebur128", "-f", "null", "-"]);
  const out = [];
  for (const m of r.err.matchAll(/t:\s*([\d.]+)\s+TARGET:\S+ LUFS\s+M:\s*(-?[\d.]+)/g)) out.push({ t: Number(m[1]) - 0.2, M: Number(m[2]) });
  return out;
}
const energyDb = (xs) => (xs.length ? 10 * Math.log10(xs.reduce((a, x) => a + 10 ** (x / 10), 0) / xs.length) : null);
const r1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? "n/a" : x.toFixed(1));
let audioSummary = null;
{
  const SB = resolve(opts["sound-build"] ?? join(P, "sound-build"));
  const pick = CAPTIONS ? ["", "-vo"] : ["-vo", ""];
  const tag = pick.find((t) => existsSync(join(SB, `mix${t}.wav`)) || existsSync(join(SB, `last-build${t}.json`)));
  const mix = tag !== undefined && existsSync(join(SB, `mix${tag}.wav`)) ? join(SB, `mix${tag}.wav`) : null;
  let report = null;
  if (tag !== undefined && existsSync(join(SB, `last-build${tag}.json`))) try { report = readJson(join(SB, `last-build${tag}.json`)); } catch {}
  if (!mix && !info.audio) skipped.push(`Audio: no sound build in \`${relP(SB)}\` (mix.wav / mix-vo.wav) and the render has no audio track: nothing to measure. Run the sound build first (sound/README.md).`);
  else {
    const md = [`# Audio: ${NAME} (measured, not heard)`, "", "Every number here is measured by ffmpeg or the sound build. None of it says the mix sounds right: someone listens to the delivered file on speakers and on headphones before it ships (voiceover/README.md, Listening checks).", ""];
    const rows = [];
    const lr = info.audio ? await loudness(RENDER) : null;
    if (lr) rows.push({ what: `the render's own audio track (${info.audioCodec})`, ...lr });
    const lm = mix ? await loudness(mix) : null;
    if (lm) rows.push({ what: `\`${relP(mix)}\``, ...lm });
    md.push("## Loudness (EBU R128, ffmpeg ebur128)", "", "Targets of the sound build: -16 LUFS integrated, true peak at or under -1 dBTP.", "", "| file | integrated LUFS | range LU | true peak dBTP | |", "|---|--:|--:|--:|---|");
    for (const x of rows) md.push(`| ${x.what} | ${r1(x.I)} | ${r1(x.LRA)} | ${r1(x.TP)} | ${x.I !== null && Math.abs(x.I + 16) > 0.5 ? "off target" : ""}${x.TP !== null && x.TP > -1 ? " peak over -1" : ""} |`);
    md.push("");
    if (report?.video && basename(report.video).replace(/\.mp4$/, "").replace(/\.picture-only$/, "") !== NAME) md.push(`The last sound build (\`last-build${tag}.json\`) was for \`${report.video}\`, not \`${NAME}.mp4\`: the mix may belong to another cut.`, "");
    if (report?.warnings?.length) md.push(`The sound build reported ${report.warnings.length} warning(s):`, "", ...report.warnings.map((w) => `- ${w}`), "");
    // per-line voice over music
    const vo = report?.voiceover;
    const plPath = resolve(opts.placement ?? join(P, "voiceover", "placement.json"));
    let lineMethod = null;
    if (vo?.lines?.length) {
      lineMethod = "the sound build's report";
      md.push("## Voice over music, per line", "", `From \`last-build${tag}.json\`: the sound build measured each line on its own voice and music before mixing them (K-weighted, gated). The build's floor is ${8} dB; music sits about 11 dB under the voice by design.`, "", "| line | film from | to | voice LUFS | music under LUFS | voice over music dB |", "|---|--:|--:|--:|--:|--:|");
      for (const l of vo.lines) md.push(`| ${l.id} | ${Number(l.start).toFixed(2)} | ${Number(l.end).toFixed(2)} | ${r1(l.voiceLufs)} | ${r1(l.musicUnderLufs)} | ${r1(l.voiceOverMusicDb)} |`);
      md.push("", `Spread across lines: ${vo.lineSpreadLU} LU; voice over music min ${vo.voiceOverMusic?.min}, median ${vo.voiceOverMusic?.median}, max ${vo.voiceOverMusic?.max} dB.`, "");
    } else if (existsSync(plPath) && (mix || info.audio)) {
      lineMethod = "the mix in each line window vs outside every line (a proxy)";
      let lines = [];
      try {
        const pj = readJson(plPath);
        const arr = Array.isArray(pj) ? pj : pj.lines ?? pj.placements ?? pj.items ?? [];
        lines = arr.map((l, i) => ({ id: l.id ?? i + 1, start: Number(l.speechStart ?? l.start), end: Number(l.speechEnd ?? l.end), text: l.text ?? "" })).filter((l) => l.end > l.start);
      } catch {}
      const src = mix ?? RENDER;
      const M = lines.length ? await momentary(src) : [];
      const inAny = (t) => lines.some((l) => t >= l.start - 0.3 && t <= l.end + 0.3);
      const outside = energyDb(M.filter((x) => !inAny(x.t) && x.M > -70).map((x) => x.M));
      md.push("## Voice over music, per line (proxy)", "", `No voice and music stems and no per-line report from the sound build, so this is **the mix itself, measured inside each placed line** (\`${relP(plPath)}\`, speech span) **against the mix outside every line** (momentary loudness, 400 ms windows; silence under -70 LUFS ignored). It shows whether the lines stand out of the bed; it is not a voice/music ratio. Source: \`${relP(src)}\`.`, "", `Outside the lines: ${r1(outside)} LUFS.`, "", "| line | film from | to | mix in line LUFS | over outside dB | text |", "|---|--:|--:|--:|--:|---|");
      for (const l of lines) {
        const e = energyDb(M.filter((x) => x.t >= l.start && x.t <= l.end).map((x) => x.M));
        md.push(`| ${l.id} | ${l.start.toFixed(2)} | ${l.end.toFixed(2)} | ${r1(e)} | ${e !== null && outside !== null ? r1(e - outside) : "n/a"} | ${String(l.text).slice(0, 60).replace(/\|/g, "\\|")} |`);
      }
      md.push("");
    } else if (!CAPTIONS) skipped.push("Audio: no per-line voice over music: neither the sound build's voiceover report nor a `voiceover/placement.json` (pass --placement).");
    md.push("## Deeper checks", "", "- `node voiceover/listen-check.mjs <mix> --script voiceover/script.json --vo voiceover/vo-track.wav`: word errors per line (a transcript), voice over music with the voice stem, clipping (still measured, not heard).", "- `last-build.json` in the sound build: joins, effect levels, sync of every hit against its cue.", "");
    writeFileSync(join(OUT, "audio.md"), md.join("\n"));
    audioSummary = { render: lr, mix: lm ? { file: relP(mix), ...lm } : null, perLine: lineMethod };
    measured.push({ what: `Audio, measured not heard: loudness and true peak of ${rows.map((x) => x.what).join(" and ")}${lineMethod ? `; per-line voice over music from ${lineMethod}` : ""}`, file: "audio.md" });
    log(`  audio: ${rows.length} file(s) measured${lineMethod ? `, per line from ${lineMethod}` : ""}`);
  }
}

// ---------------- 6. costs ----------------
let costRows = null;
{
  const sp = resolve(opts.state ?? join(P, "state.json"));
  let st = null;
  if (existsSync(sp)) try { st = readJson(sp); } catch (e) { skipped.push(`Costs: ${relP(sp)} is not valid JSON (${e.message}).`); }
  costRows = Array.isArray(st?.costs) ? st.costs : null;
  if (!st) { if (!skipped.some((x) => x.startsWith("Costs"))) skipped.push(`Costs: no state.json at \`${relP(sp)}\` (the CLI writes it; \`walkthrough cost add\` adds rows).`); }
  else if (!costRows?.length) skipped.push("Costs: the ledger in state.json is empty (`walkthrough cost add`).");
  else {
    const totals = {};
    for (const c of costRows) {
      const t = (totals[c.kind] ??= { rows: 0, units: 0, amount: 0, amounts: 0 });
      t.rows++;
      t.units += Number(c.units) || 0;
      if (c.amount !== null && c.amount !== undefined) { t.amount += Number(c.amount) || 0; t.amounts++; }
    }
    const md = [
      `# Costs: ${st.name ?? basename(P)}`,
      "",
      "The ledger from `state.json` (`walkthrough cost show`). Units are what each provider counts: TTS characters, music seconds, agent turns or tokens, render minutes (wall clock). Amounts are in whatever currency the ledger is kept in.",
      "",
      "| at | kind | units | amount | note |",
      "|---|---|--:|--:|---|",
      ...costRows.map((c) => `| ${String(c.at ?? "").replace("T", " ").slice(0, 16)} | ${c.kind} | ${c.units} | ${c.amount ?? ""} | ${String(c.note ?? "").replace(/\|/g, "\\|")} |`),
      "",
      "## Totals",
      "",
      "| kind | rows | units | amount |",
      "|---|--:|--:|--:|",
      ...Object.entries(totals).map(([k, t]) => `| ${k} | ${t.rows} | ${Math.round(t.units * 100) / 100} | ${t.amounts ? Math.round(t.amount * 100) / 100 : ""} |`),
      "",
    ];
    writeFileSync(join(OUT, "costs.md"), md.join("\n"));
    measured.push({ what: `Cost ledger: ${costRows.length} row(s)`, file: "costs.md" });
    costRows = { rows: costRows.length, totals };
  }
}

// ---------------- 7. REVIEW.md ----------------
function checklist() {
  let text = "";
  try { text = readFileSync(join(KIT, "skills/review-film/SKILL.md"), "utf8"); } catch {}
  const sec = /## Checklist the critic must cover[^\n]*\n([\s\S]*?)(\n## |$)/.exec(text);
  const items = sec ? sec[1].split("\n").filter((l) => /^- /.test(l)).map((l) => l.slice(2).trim()) : [];
  if (!items.length) items.push("Clicked control fully in frame at every click; captions true to the frame and readable; no frozen holds; no pointer jumps across cuts; title and end card legible.");
  const vo = /For a voiceover twin, the critic also checks ([\s\S]*?)\n\n/.exec(text);
  if (!CAPTIONS) items.push(`Voiceover twin: ${vo ? vo[1].replace(/\s+/g, " ").trim() : "each spoken line is true to its frames and does not talk over a reveal it should leave silent."}`);
  items.push("Listened to the delivered file on speakers and on headphones (the audio numbers are measured, not heard).");
  return items.map((x) => `- [ ] ${x}`).join("\n");
}
const date = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
const facts = [
  `- Render: \`${relP(RENDER)}\` (${(info.bytes / 1048576).toFixed(1)} MB)`,
  `- Duration: ${fmt(DUR)} (${DUR.toFixed(3)} s), ${FPS} fps, ${info.width}x${info.height}`,
  `- Captions: ${CAPTIONS ? "on" : "off (the voiceover twin)"}${srtF ? ` (\`${relP(srtF.path)}\`)` : ""}`,
  `- Audio track in the render: ${info.audio ? `yes (${info.audioCodec})` : "none (picture only)"}`,
  `- Scenes: ${(edl.scenes ?? []).map((s) => `${s.id} ${fmt(s.start)}`).join(", ") || "n/a"}`,
  `- Sidecars: \`${relP(cuesF.path)}\`, \`${relP(edlF.path)}\``,
].join("\n");
const auditSummary = audit
  ? [`**${audit.errors} error(s), ${audit.warnings} warning(s)**${holdsRows ? `, plus ${holdsRows.length} hold(s) from holds.py` : ""}. Worst first:`, "", ...findings.filter((f) => f.level === "error" || f.level === "warn").slice(0, 12).map((f) => `- ${f.level} ${f.t !== null ? `at ${f.t.toFixed(2)} s ` : ""}(${f.check}${f.scene ? `, ${f.scene}` : ""}): ${f.detail}`), ...(findings.filter((f) => f.level === "error" || f.level === "warn").length > 12 ? ["- ... the rest in audit.md"] : []), ...(findings.some((f) => f.level === "error" || f.level === "warn") ? [] : ["- nothing over the thresholds"])].join("\n")
  : "The audit did not run (see Not measured).";
const audioText = audioSummary
  ? [
      ...(audioSummary.render ? [`- Render audio: ${r1(audioSummary.render.I)} LUFS integrated, true peak ${r1(audioSummary.render.TP)} dBTP, range ${r1(audioSummary.render.LRA)} LU.`] : []),
      ...(audioSummary.mix ? [`- Mix \`${audioSummary.mix.file}\`: ${r1(audioSummary.mix.I)} LUFS integrated, true peak ${r1(audioSummary.mix.TP)} dBTP, range ${r1(audioSummary.mix.LRA)} LU.`] : []),
      `- Per-line voice over music: ${audioSummary.perLine ?? "not measured"}. Details in [audio.md](audio.md).`,
      "- Measured, not heard: these numbers do not replace listening to the delivered file.",
    ].join("\n")
  : "No sound build and no audio track: nothing measured.";
const costsText = costRows ? `${costRows.rows} row(s) in the ledger; totals per kind: ${Object.entries(costRows.totals).map(([k, t]) => `${k} ${Math.round(t.units * 100) / 100} units${t.amounts ? ` (${Math.round(t.amount * 100) / 100})` : ""}`).join(", ")}. See [costs.md](costs.md).` : "No cost rows (see Not measured).";
const measuredText = [
  ...measured.map((m) => `- ${m.what}: [${m.file}](${m.file})`),
  `- The page: [index.html](index.html) (open it from this folder; the video loads from \`${relOut(RENDER)}\`)`,
  "",
  "For the review loop (skills/review-film): give the frame-describers the sheets, the critic `audit.md`, `holds.md`, the strips and this file; rule in the Rulings section below.",
].join("\n");
const tpl = readFileSync(join(ASSETS, "REVIEW.template.md"), "utf8");
const fill = (s, map) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in map ? String(map[k]) : m));
writeFileSync(
  join(OUT, "REVIEW.md"),
  fill(tpl, {
    TITLE: `${basename(P)} / ${NAME}`,
    DATE: date,
    FACTS: facts,
    MEASURED: measuredText,
    AUDIT_SUMMARY: auditSummary,
    AUDIO: audioText,
    COSTS: costsText,
    SKIPPED: skipped.length ? skipped.map((s) => `- ${s}`).join("\n") : "- Nothing skipped.",
    CHECKLIST: checklist(),
  }),
);

// ---------------- 8. index.html ----------------
const files = [
  ["REVIEW.md", "film facts, what was measured, the critic checklist, rulings"],
  ["audit.md", "the build audit as tables"],
  ["audit.json", "the build audit, raw"],
  ["holds.md", "dead holds"],
  ["audio.md", "loudness, true peak, voice over music (measured, not heard)"],
  ["costs.md", "the cost ledger"],
].filter(([f]) => existsSync(join(OUT, f))).map(([name, what]) => ({ name, href: name, what }));
const videoSrc = relOut(RENDER).split("/").map(encodeURIComponent).join("/");
const data = {
  title: `Review: ${basename(P)} / ${NAME}`,
  storageKey: `${basename(P)}/${basename(OUT)}/${NAME}@${statSync(RENDER).mtimeMs.toFixed(0)}`,
  render: { src: videoSrc, name: `${NAME}.mp4`, duration: DUR, fps: FPS, width: info.width, height: info.height, captions: CAPTIONS, audio: info.audio },
  counts: { errors: audit?.errors ?? 0, warnings: (audit?.warnings ?? 0) + (holdsRows?.length ?? 0) },
  findings,
  sheets,
  cuts,
  files,
  labels: LABELS !== "none",
};
const page = fill(readFileSync(join(ASSETS, "page.html"), "utf8"), {
  TITLE: data.title.replace(/[<&>"]/g, (c) => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;", '"': "&quot;" })[c]),
  VIDEO: videoSrc.replace(/"/g, "%22"),
  CSS: readFileSync(join(ASSETS, "page.css"), "utf8"),
  JS: readFileSync(join(ASSETS, "page.js"), "utf8"),
  DATA: JSON.stringify(data).replace(/</g, "\\u003c"),
  FOOTER: `Written by walkthrough-studio film/scripts/review-bundle.mjs on ${date}. A static page: nothing on it is sent anywhere; notes leave only through Export notes.`,
});
writeFileSync(join(OUT, "index.html"), page);

// ---------------- 9. bundle.json, cleanup ----------------
rmSync(WORK, { recursive: true, force: true });
const summary = {
  schema: "walkthrough-review-bundle/1",
  at: new Date().toISOString(),
  render: relP(RENDER),
  out: relP(OUT),
  duration: DUR,
  fps: FPS,
  captions: CAPTIONS,
  labels: LABELS,
  sheets: sheets.length,
  cuts: cuts.length,
  audit: audit ? { errors: audit.errors, warnings: audit.warnings, exit: audit.exit } : null,
  holds: holdsRows ? holdsRows.length : null,
  audio: audioSummary,
  costs: costRows ? costRows.rows : null,
  measured: measured.map((m) => m.file),
  skipped,
};
writeFileSync(join(OUT, "bundle.json"), JSON.stringify(summary, null, 2) + "\n");
if (opts.json) console.log(JSON.stringify(summary, null, 2));
else {
  for (const s of skipped) log(`  not measured: ${s.replace(/`|\*\*/g, "")}`);
  log(`review bundle: ${relP(OUT)}/ (REVIEW.md, index.html${files.length ? ", " + files.map((f) => f.name).filter((n) => n !== "REVIEW.md").join(", ") : ""}, sheets/, cuts/)`);
}
