// The real build: storyboard.json + take folders -> pre-cut scene clips, scene compositions,
// captions, index.html, cues.json and the .srt.
//
//   node <kit>/film/build.mjs [storyboard.json] [--project <dir>] [--takes <dir>] [--brand <brand.json>]
//                 [--no-cut | --emit-only] [--no-captions] [--dry [--dry-out <dir>]] [--audit]
//                 [--fit-audio <placement.json> [--fit-gap 0.3] [--fit-max 6]]
//
// --fit-audio (or "fitAudio" in the storyboard): script-first timing. Each placed voice line longer
// than its window gets a stretch on the longest rest moment in it (fitAudioPlan below); edl.json
// lists them in "fitAudio". Off by default: picture-first.
//
// --emit-only writes everything but the footage (index.html, compositions/, cues.json, edl.json,
// captions.srt): no ffmpeg, the masters need not exist, and each scene's <video src> points at the
// clip path a full build would cut (assets/footage/<scene>.mp4). The golden test (test/run.mjs)
// compares its output.
//
// --audit runs scripts/audit.mjs on what was just written (holds, pointer jumps at cuts, dead air,
// caption lint, caption claims) and exits with its status; with --dry it audits the would-be files
// (in --dry-out, or a temporary folder) without the holds check.
//
// Everything is written into the project folder (lib/config.mjs PROJECT_DIR: --project, FILM_PROJECT,
// the storyboard's folder when it is a project, the current directory when it holds a storyboard.json
// or hyperframes.json, else this film/ folder), which is made a HyperFrames project if it is not one
// yet (lib/project.mjs). The kit is never written to. The storyboard defaults to
// <project>/storyboard.json. Take folders come from --takes, else WALKTHROUGH_TAKES, else the
// storyboard's "takesDir" (relative to the storyboard), else <project>/takes, else ../takes next to
// the project.
//
// One mapping per scene (lib/edl.mjs) turns source time into film time; the footage cut, the
// pointer, clicks, cursor shapes, camera, spotlights, captions, time-lapse tags and sound cues all
// go through it, so a re-cut can never desync them. Event references are "type:label" (or
// "type:label#n") into the take's events.json (schema "walkthrough-take/1", see lib/edl.mjs).
//
// Aspect (lib/config.mjs: look.aspect, --aspect, FILM_ASPECT): 16:9, 9:16 or 1:1; the layout is
// derived from it and from the takes' viewport. Every take must share the viewport the layout was
// made for; 9:16 needs a portrait (phone-preset) take unless look.allowLetterbox is true. A phone
// take gets a neutral device bezel (lib/stage.mjs; look.bezel false turns it off).
//
// Pointer continuity at cuts (lib/pointer.mjs cutTreatment): where a cut moves the drawn pointer
// more than jump.bridge stage px and the storyboard gives no treatment, a bridge (short arc move) or
// a fade is applied; each one is printed and listed in edl.json "pointerTreatments".

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ASPECT, ASPECTS, BRAND, CAPTURE, COLOR, DEVICE, FILM, K, LAYOUT, PROJECT_DIR, TAKES_DIR, WINDOW, cliArgs } from "./lib/config.mjs";
import { ensureProject } from "./lib/project.mjs";
import { n, sceneFile } from "./lib/emit.mjs";
import { Pointer, shapeForCursor, moveDuration, cutTreatment, bridgeSeconds, CUT_BRIDGE, CUT_FADE } from "./lib/pointer.mjs";
import { Camera } from "./lib/camera.mjs";
import { spotlight } from "./lib/spotlight.mjs";
import { stage } from "./lib/stage.mjs";
import { captionsScene, captionHold, lintCaptions, toSrt } from "./lib/captions.mjs";
import { titleScene, endScene } from "./lib/titlecards.mjs";
import { timelapseTag, tagPlacement } from "./lib/tag.mjs";
import { buildMapping, anchorTime, findRef, refBox, gridFps, snapTo, checkTakeSchema, restSpans } from "./lib/edl.mjs";
import { parseIndex } from "./lib/takeindex.mjs";
import { pointerAt } from "../recorder/motion.mjs";

const kit = dirname(fileURLToPath(import.meta.url)); // this film/ folder: code only
const film = PROJECT_DIR; // the project: inputs and every output
const { opts, positional } = cliArgs();
const sbPath = resolve(positional.find((a) => a.endsWith(".json")) ?? join(film, "storyboard.json"));
if (!existsSync(sbPath)) throw new Error(`no storyboard at ${sbPath} (copy storyboard.example.json to storyboard.json, or pass a path)`);
const DRY = Boolean(opts.dry); // compute and report only: no ffmpeg, no files written
const EMIT_ONLY = Boolean(opts["emit-only"]); // write everything but the footage (no ffmpeg)
if (DRY && EMIT_ONLY) throw new Error("--dry and --emit-only exclude each other");
const CUT = !opts["no-cut"] && !DRY && !EMIT_ONLY;
// --no-captions: same film to the frame, but the captions track is not mounted (voiceover twin).
// Caption timing still drives tag placement, cues and the .srt, so the picture is otherwise identical.
const sb = JSON.parse(readFileSync(sbPath, "utf8"));
const NO_CAPTIONS = Boolean(opts["no-captions"]) || sb.captions === false;
const FPS = FILM.fps;
const CLIP_FPS = sb.clipFps ?? FPS;
// --takes, WALKTHROUGH_TAKES, the storyboard's "takesDir", <project>/takes, ../takes (lib/config.mjs)
const takesDir = TAKES_DIR;
if (!existsSync(takesDir)) throw new Error(`takes folder not found: ${takesDir} (pass --takes <dir> or set "takesDir" in the storyboard)`);
// the aspect against the recording: 9:16 is made for a portrait (phone-preset) take
if (LAYOUT.portrait && CAPTURE.width > CAPTURE.height && !LAYOUT.allowLetterbox)
  throw new Error(`${ASPECT} needs a phone-preset take; record with viewport: phone (${DEVICE.take ? `take ${DEVICE.take} is` : "the capture is"} ${CAPTURE.width}x${CAPTURE.height}). To letterbox this landscape take in ${ASPECT} anyway, set look.allowLetterbox: true.`);
// the creatives manifest is only needed to write the title and end cards (not for --dry)
const manifestPath = join(film, "assets/creatives/manifest.json");
const creatives = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
if (!creatives && !DRY) throw new Error("no assets/creatives/manifest.json: run node <kit>/film/scripts/sync-assets.mjs (or scripts/make-placeholder.mjs for stand-ins) for this project");
const warnings = [];
const BRAND_NOTE = `, brand ${BRAND.name}, aspect ${ASPECT} (${FILM.width}x${FILM.height}${DEVICE.phone ? ", phone take" : ""})`;
const warn = (m) => warnings.push(m);
{
  const a = ASPECTS[ASPECT];
  if (FILM.width * a.height !== FILM.height * a.width) warn(`look.film is ${FILM.width}x${FILM.height}, not ${ASPECT}: a look section sets the canvas (remove look.film to use the aspect's ${a.width}x${a.height})`);
}

// capture gaps per take, from the recorder's INDEX.md (absent for the sample take)
const GAPS = parseIndex(join(takesDir, "INDEX.md"));

/**
 * Range sugar for an agent wait: { wait: "<label>", from, to, loaders = 1.8, timelapse = 2.8, label }
 * -> loaders at normal speed from waitStart, the rest of the wait as a labelled time-lapse of
 * `timelapse` film seconds, then normal speed from waitEnd to `to` (the reveal and its hold).
 */
function expandRanges(tk, ranges) {
  return ranges.flatMap((r) => {
    if (!r.wait) return [r];
    const ws = { ref: `waitStart:${r.wait}` };
    const we = { ref: `waitEnd:${r.wait}` };
    const split = { ref: `waitStart:${r.wait}`, offset: r.loaders ?? 1.8 };
    return [
      { from: r.from ?? ws, to: split, ...(r.pointer ? { pointer: r.pointer } : {}) },
      { from: split, to: we, timelapse: { duration: r.timelapse ?? 2.8, label: r.label ?? "Time-lapse" } },
      { from: we, to: r.to },
    ];
  });
}

/**
 * Montage sugar: { montage: ["mark:…", …], lead = -0.05, beat = storyboard music.beat ?? 0.625 } becomes one slice per mark,
 * each exactly one beat long on the film clock (frame-exact: 37/38 frames at 60 fps), starting on a
 * beat. The range before it is held a little longer (more of its own footage) so the first slice
 * lands on a beat line counted from film start (the music bed is anchored there).
 */
function expandMontage(tk, ranges, filmStart, grid, sc) {
  const i = ranges.findIndex((r) => r.montage);
  if (i < 0) return ranges;
  const r = ranges[i];
  const beat = r.beat ?? sb.music?.beat ?? 0.625, lead = r.lead ?? -0.05; // the music grid's beat (96 BPM = 0.625 s)
  const before = ranges.slice(0, i).map((x) => ({ ...x, from: typeof x.from === "number" ? x.from : { ...x.from }, to: typeof x.to === "number" ? x.to : { ...x.to } }));
  let t = filmStart;
  if (before.length) t += buildMapping(tk, before, { grid, excise: sc.excise ?? [] }).duration;
  // within a frame of a beat line counts as on it (beats are not frame-aligned at 30/60 fps)
  const near = Math.round(t / beat) * beat;
  const tb = Math.abs(t - near) <= 1 / grid + 1e-6 ? near : Math.ceil(t / beat) * beat;
  const hold = Math.max(0, snapTo(tb - t, grid));
  if (hold > 0) {
    if (!before.length) throw new Error(`${sc.id}: a montage that opens a scene cannot be held onto a beat`);
    const last = before[before.length - 1];
    if (typeof last.to === "number") last.to += hold;
    else last.to.offset = (last.to.offset ?? 0) + hold;
  }
  const slices = r.montage.map((ref, k) => {
    const s0 = snapTo(anchorTime(tk, { ref, offset: lead }), grid);
    const L = Math.round((tb + beat * (k + 1)) * grid) - Math.round((tb + beat * k) * grid);
    return { from: s0, to: s0 + L / grid, montage: true };
  });
  return [...before, ...slices, ...ranges.slice(i + 1)];
}

/**
 * Capture gaps that fall in kept normal-speed footage: excised when the pointer is at rest; when a
 * gap overlaps a pointer move or a click it is kept (a visible hitch) and reported, unless the
 * storyboard already cuts around it.
 */
function autoExcise(tk, ranges, grid, sc) {
  const gaps = GAPS.get(sc.take) ?? [];
  if (!gaps.length || sc.autoExcise === false) return { excise: [], accepted: [] };
  const pre = buildMapping(tk, ranges, { grid });
  const excise = [];
  const accepted = [];
  const busy = (a, b) =>
    tk.events.some((e) => {
      const span = e.type === "move" ? [e.t, e.tEnd] : e.type === "down" ? [e.t, tk.events.find((u) => u.type === "up" && u.t >= e.t)?.t ?? e.t] : null;
      return span && span[0] < b && span[1] > a;
    });
  for (const g of gaps) {
    const seg = pre.ranges.find((r) => g.from < r.srcOut && g.to > r.srcIn);
    if (!seg) continue; // in cut footage already (inside a time-lapse it still shows as a hitch, so it goes too)
    const a = Math.max(g.from, seg.srcIn), b = Math.min(g.to, seg.srcOut);
    const a0 = Math.floor(a * grid + 1e-6) / grid, b0 = Math.ceil(b * grid - 1e-6) / grid; // as excise would snap
    if (busy(a0, b0)) { if (!seg.timelapse) accepted.push({ ...g, why: "overlaps a pointer move or click" }); } // in a time-lapse it is compressed below a frame or two
    else excise.push({ from: a, to: b, note: `capture gap ${g.ms} ms` });
  }
  return { excise, accepted };
}

// ---------- takes ----------
const takes = new Map();
function take(name) {
  if (!takes.has(name)) {
    const dir = join(takesDir, name);
    const ev = checkTakeSchema(JSON.parse(readFileSync(join(dir, "events.json"), "utf8")), name);
    // one film, one capture: the layout (window, K, bezel) was made for CAPTURE
    if (ev.viewport && (ev.viewport.width !== CAPTURE.width || ev.viewport.height !== CAPTURE.height))
      throw new Error(`take ${name} was recorded at ${ev.viewport.width}x${ev.viewport.height} but the film is laid out for ${CAPTURE.width}x${CAPTURE.height}${DEVICE.take ? ` (take ${DEVICE.take})` : " (look.capture)"}: every take in one film must share its viewport`);
    const tj = existsSync(join(dir, "take.json")) ? JSON.parse(readFileSync(join(dir, "take.json"), "utf8")) : {};
    // sync.keep {from, to}: the footage between the last start flash and the first end flash
    takes.set(name, { ...ev, dir, master: join(dir, ev.video?.file ?? "master.mp4"), keep: tj.sync?.keep ?? null });
  }
  return takes.get(name);
}

// ---------- one scene's cut: ranges and mapping (shared by the build and the fit-audio plan) ----------
/**
 * Fit-audio stretches into the scene's (expanded, pre-montage) ranges: each fit { line, src: [a, b],
 * duration } splits the plain range holding source a..b into before / a stretch of a..b held for
 * `duration` film seconds (tagged fit: line) / after. Plain: no time-lapse, stretch or montage.
 */
function applyFits(tk, ranges, fits, grid, sc) {
  if (!fits.length) return ranges;
  let out = ranges;
  for (const f of [...fits].sort((p, q) => p.src[0] - q.src[0])) {
    const [a, b] = f.src;
    const k = out.findIndex((r) => !r.timelapse && !r.stretch && !r.montage
      && snapTo(anchorTime(tk, r.from), grid) <= a + 1e-9 && snapTo(anchorTime(tk, r.to), grid) >= b - 1e-9);
    if (k < 0) throw new Error(`${sc.id}: fit-audio hold for ${f.line} (source ${a.toFixed(3)}-${b.toFixed(3)} s) is not inside a plain range`);
    const r = out[k];
    const r0 = snapTo(anchorTime(tk, r.from), grid), r1 = snapTo(anchorTime(tk, r.to), grid);
    const parts = [];
    if (a > r0 + 1e-9) parts.push({ ...r, to: a });
    parts.push({ from: a, to: b, stretch: { duration: f.duration }, fit: f.line, ...(a <= r0 + 1e-9 && r.pointer ? { pointer: r.pointer } : {}) });
    if (b < r1 - 1e-9) parts.push({ from: b, to: r.to });
    out = [...out.slice(0, k), ...parts, ...out.slice(k + 1)];
  }
  return out;
}

/**
 * The scene's ranges and mapping as the build cuts them: wait sugar, fit-audio holds, montage,
 * capture-gap excision, buildMapping; plus its duration (a push ends it early). `quiet` (the
 * fit-audio plan) keeps its warnings out of the build's. `plainOf(k)`: the storyboard range behind
 * mapped range k when it is plain (normal speed, not a montage slice), else null.
 */
function sceneCut(sc, filmStart, fits = [], quiet = false) {
  const tk = take(sc.take);
  const grid = gridFps(FPS, CLIP_FPS, tk.fps);
  const base = applyFits(tk, expandRanges(tk, sc.ranges), fits, grid, sc);
  const ranges = expandMontage(tk, base, filmStart, grid, sc);
  const auto = autoExcise(tk, ranges, grid, sc);
  if (!quiet) for (const g of auto.accepted) warn(`${sc.id}: capture gap ${g.from.toFixed(2)} s +${g.ms} ms kept (${g.why}${g.note ? "; " + g.note : ""})`);
  const M = buildMapping(tk, ranges, { grid, excise: [...(sc.excise ?? []), ...auto.excise], warn: quiet ? () => {} : (m) => warn(`${sc.id}: ${m}`) });
  M.gapsAccepted = auto.accepted;
  const at = (a) => {
    const src = snapTo(anchorTime(tk, a), grid); // anchors share the range bounds' grid
    const t = M.map(src);
    if (t === null) throw new Error(`${sc.id}: anchor ${JSON.stringify(a)} (source ${src.toFixed(3)} s) falls in cut footage`);
    return snapTo(t, FPS);
  };
  let duration = M.duration, pushAt = null;
  if ((sc.exit?.type ?? "hard") === "push") {
    pushAt = at({ ref: sc.exit.ref }) + 0.12;
    duration = Math.min(duration, snapTo(pushAt + 0.5 + 0.35, FPS));
  }
  const mi = base.findIndex((r) => r.montage);
  const ns = mi < 0 ? 0 : base[mi].montage.length;
  const plainOf = (k) => {
    const r = mi < 0 || k < mi ? base[k] : k >= mi + ns ? base[k - ns + 1] : null;
    return r && !r.timelapse && !r.stretch && !r.montage ? r : null;
  };
  return { tk, grid, ranges, M, at, duration, pushAt, plainOf };
}

// ---------- footage cut ----------
function cutClip(sceneId, tk, mapping, holdFrames = []) {
  const out = join(film, "assets/footage", `${sceneId}.mp4`);
  if (!CUT) return out; // --dry, --no-cut, --emit-only: the path only (the master need not exist)
  const st = statSync(tk.master);
  const spec = JSON.stringify({ src: tk.master, size: st.size, mtime: st.mtimeMs, ranges: mapping.ranges, fps: CLIP_FPS, hb: sb.heartbeatCover ?? null, hold: holdFrames, v: 5 });
  const specFile = out.replace(/\.mp4$/, ".cut.json");
  if (existsSync(out) && existsSync(specFile) && readFileSync(specFile, "utf8") === spec) return out;
  mkdirSync(dirname(out), { recursive: true });
  // Heartbeat cover: the recorder's 1 CSS px timing marker sits in the top-left corner. Each frame,
  // the pixels just right of it are copied over it (same page background, frame by frame), so it
  // cannot show even in a zoomed framing; the frame size is untouched.
  const hb = sb.heartbeatCover === false ? null : { x: 0, y: 0, w: 3, h: 3, ...(sb.heartbeatCover ?? {}) };
  const sc = tk.scale ?? 2;
  const pre = [];
  let src = "[0:v]";
  if (hb) {
    const [x, y, w, h] = [hb.x, hb.y, hb.w, hb.h].map((v) => Math.round(v * sc));
    pre.push(`[0:v]split=2[hbA][hbB]`, `[hbB]crop=${w}:${h}:${x + w}:${y}[hbP]`, `[hbA][hbP]overlay=${x}:${y}[clean]`);
    src = "[clean]";
  }
  // Single blank frames (a preview re-mounting on an option switch) are replaced by the frame before.
  const mfps = tk.fps ?? 60;
  const held = new Set(holdFrames.map((t) => Math.round(t * mfps)));
  holdFrames.forEach((t, i) => {
    const k = Math.round(t * mfps);
    let r = k - 1;
    while (held.has(r)) r--;
    // freezeframes takes the replacement frame from its second input (the same stream)
    pre.push(`${src}split=2[hfA${i}][hfB${i}]`, `[hfA${i}][hfB${i}]freezeframes=first=${k}:last=${k}:replace=${r}[hold${i}]`);
    src = `[hold${i}]`;
  });
  const N = mapping.ranges.length;
  pre.push(`${src}split=${N}${mapping.ranges.map((_, i) => `[s${i}]`).join("")}`);
  const parts = mapping.ranges.map(
    (r, i) => `[s${i}]trim=start=${r.srcIn}:end=${r.srcOut},setpts=(PTS-STARTPTS)/${n(r.rate)},fps=${CLIP_FPS}[v${i}]`,
  );
  const concat = mapping.ranges.map((_, i) => `[v${i}]`).join("") + `concat=n=${N}:v=1:a=0,fps=${CLIP_FPS},format=yuv420p[out]`;
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error", "-i", tk.master,
    "-filter_complex", [...pre, ...parts, concat].join(";"), "-map", "[out]",
    "-c:v", "libx264", "-crf", "14", "-preset", "medium",
    "-g", String(CLIP_FPS), "-keyint_min", String(CLIP_FPS), "-sc_threshold", "0",
    "-r", String(CLIP_FPS), "-fps_mode", "cfr", "-an", "-movflags", "+faststart", out,
  ]);
  writeFileSync(specFile, spec);
  const probe = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets,r_frame_rate", "-of", "csv=p=0", out], { encoding: "utf8" }).trim();
  const frames = Number(probe.split(",").pop());
  const want = Math.round(mapping.duration * CLIP_FPS);
  if (Math.abs(frames - want) > 1) warn(`${sceneId}: clip has ${frames} frames, expected ${want}`);
  return out;
}

// ---------- pointer at cuts ----------
const CUT_MODE = sb.pointerAtCuts ?? "auto";
const pointerTreatments = []; // every bridge/fade the build applied, for edl.json and the audit

// ---------- one stage scene ----------
/** prev: the previous built scene (null for the first): its exit, storyboard entry, pointer and end point. */
/** fits: the fit-audio holds for this scene ([] unless --fit-audio). */
function buildScene(sc, prev, filmStart, fits = []) {
  const prevExit = prev?.exit ?? "settle"; // the first scene settles in after the title's hard cut
  const { tk, grid, ranges, M, at } = sceneCut(sc, filmStart, fits);
  const id = sc.id;
  const cam = new Camera({ stage: id });
  const cues = [];
  // entrance, caused by the previous scene's exit
  // entrance: caused by the previous scene's exit, or set on the scene ("settle" = arrive 6% large)
  const enter = sc.enter ?? (prevExit === "push" ? "settle" : prevExit);
  if (enter === "settle") cam.settleIn({ at: 0 });
  if (enter === "whip") cam.whipIn({ at: 0, dir: -1 });

  // camera framings by event/mark box
  for (const c of sc.camera ?? []) {
    if (c.wide) cam.wide({ at: at(c.at), dur: c.dur });
    else cam.frame({ box: refBox(tk, c.box), kind: c.kind ?? "control", at: at(c.at), dur: c.dur, scale: c.scale, focus: c.focus });
  }

  // spotlights by mark box
  const spots = (sc.spotlights ?? []).map((s, i) => {
    const start = at(s.start ?? { ref: s.box });
    const end = s.end ? at(s.end) : snapTo(start + (s.duration ?? 1.5), FPS);
    return spotlight({ id: `${id}-spot${i}`, box: refBox(tk, s.box), start, end });
  });

  // exit: push through a clicked control, a whip, or a hard cut
  let duration = M.duration;
  const exit = sc.exit?.type ?? "hard";
  let pushAt = null;
  if (exit === "push") {
    pushAt = at({ ref: sc.exit.ref }) + 0.12;
    const cut = snapTo(pushAt + 0.5 + 0.35, FPS);
    if (cut > M.duration + 1e-6) throw new Error(`${id}: push-through ends at ${cut} s but the kept footage ends at ${M.duration} s; extend the last range`);
    duration = cut;
    cam.pushThrough({ box: refBox(tk, sc.exit.box ?? sc.exit.ref), at: pushAt, hide: [`#${id}-ptr-arc`] });
    cues.push({ t: filmStart + cut, type: "transition", kind: "push" });
  } else if (exit === "whip") {
    cam.whipOut({ at: duration - 0.12, dir: -1 });
    cues.push({ t: filmStart + duration - 0.12, type: "transition", kind: "whip" });
  }

  // pointer: every move, click and cursor change in the kept footage, through the mapping
  const srcIn = M.ranges[0].srcIn;
  const srcEnd = M.inverse(duration);
  const curs = tk.events.filter((e) => e.type === "cursor");
  let shape0 = "arrow";
  for (const c of curs) if (c.t <= srcIn) shape0 = shapeForCursor(c.cursor);
  // Pointer continuity at cuts between takes: "enterFrom" draws the scene's first move from off the
  // frame (an explicit capture point, or "left" | "right" | "top" | "bottom": just past that edge of
  // the wide frame, in line with the first target); "exit" takes it off before the scene ends.
  const firstKeptMove = tk.events.find((e) => e.type === "move" && e.t >= srcIn - 0.5 / grid && M.map(Math.min(srcEnd, Math.max(srcIn, e.t))) !== null);
  const edgePoint = (edge, target) => {
    const L = -WINDOW.left / K - 60, R = (FILM.width - WINDOW.left) / K + 60, T = -WINDOW.top / K - 60, B = (FILM.height - WINDOW.top) / K + 60;
    return edge === "left" ? { x: L, y: target.y } : edge === "right" ? { x: R, y: target.y } : edge === "top" ? { x: target.x, y: T } : { x: target.x, y: B };
  };
  const enterFrom = sc.pointer?.enterFrom && firstKeptMove ? (typeof sc.pointer.enterFrom === "string" ? edgePoint(sc.pointer.enterFrom, firstKeptMove.to) : sc.pointer.enterFrom) : null;
  // events within half a frame of the scene's first/last kept frame count as kept (bounds are snapped)
  const tol = 0.5 / grid + 1e-6;
  const clampT = (t) => Math.min(srcEnd, Math.max(srcIn, t));
  const kept = (t) => t >= srcIn - tol && t <= srcEnd + tol && M.map(clampT(t)) !== null;
  // scene-local film times of the drawn moves and clicks: a bridge never runs into one
  const actions = [];
  for (const e of tk.events) {
    if (e.type === "move" && (e === firstKeptMove && enterFrom || (kept(e.t) && kept(e.tEnd) && M.contiguous(clampT(e.t), clampT(e.tEnd))))) actions.push({ t: M.map(clampT(e.t)), e });
    if (e.type === "down" && kept(e.t)) actions.push({ t: M.map(clampT(e.t)), e });
  }
  for (const pk of sc.pointer?.park ?? []) { const t = M.map(anchorTime(tk, pk.at)); if (t !== null) actions.push({ t, e: { type: "move", label: "park" } }); }
  const nextAction = (T, type) => Math.min(Infinity, ...actions.filter((a) => a.t >= T - 1e-6 && (!type || a.e.type === type)).map((a) => a.t));
  const showT = sc.pointer?.show === false ? Infinity : sc.pointer?.showAt ? at(sc.pointer.showAt) : 0;
  const hideT = sc.pointer?.hideAt ? at(sc.pointer.hideAt) : Infinity;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * K;
  // A move in flight at a range's first frame (it started in footage that was cut): its kept tail is
  // drawn from the pointer's point at the cut to the move's target, landing when the mouse did.
  const tails = new Set();
  const tailAt = (r) => {
    const e = tk.events.find((x) => x.type === "move" && x.t < r.srcIn - tol && x.tEnd > r.srcIn + tol && x.tEnd <= srcEnd + tol && M.contiguous(r.srcIn, clampT(x.tEnd)));
    if (!e) return null;
    tails.add(e);
    return { e, end: M.map(clampT(e.tEnd)) };
  };
  /**
   * Decide the treatment of one cut at scene-local `cut`. A bridge runs to the next drawn move or
   * click (merged with a move in flight, `tail`) and becomes a fade when there is no room; a fade
   * is back in by the next click.
   */
  const treat = ({ cut, px, override, label, tail }) => {
    const { kind, by } = cutTreatment({ px, mode: CUT_MODE, override, jump: sb.jump });
    if (!kind) return null;
    let k = kind, seconds = null, note, after = CUT_FADE.after, fadeIn = CUT_FADE.in;
    if (k === "bridge") {
      const b = bridgeSeconds(cut, nextAction(cut));
      seconds = tail ? Math.max(tail.end - cut, b ?? 0) : b;
      if (!(seconds >= CUT_BRIDGE.minSeconds - 1e-9)) { k = "fade"; seconds = null; note = "no room for a bridge before the next move"; }
    }
    if (k === "fade") {
      const room = nextAction(cut, "down") - cut;
      if (room < after + fadeIn) {
        if (room >= fadeIn) after = room - fadeIn;
        else { after = 0; fadeIn = Math.max(room, 1 / FPS); }
        note = [note, "shown by the next click"].filter(Boolean).join("; ");
      }
    }
    const r3 = (x) => Math.round(x * 1000) / 1000;
    pointerTreatments.push({ scene: id, at: r3(filmStart + cut), cut: label, kind: k, px: Math.round(px), by, ...(seconds !== null ? { seconds: r3(seconds) } : {}), ...(note ? { note } : {}) });
    return { kind: k, seconds, after, fadeIn };
  };
  // the cut into this scene: the drawn pointer was at prev.pointerEnd on the previous scene's last frame
  const startPoint = enterFrom ?? pointerAt(tk.events, srcIn, tk.pointerStart);
  const tail0 = enterFrom ? null : tailAt(M.ranges[0]);
  let entry = null;
  if (prev) {
    const psb = prev.sb;
    const treated = prevExit === "push" || prevExit === "whip" || enter === "whip" || enterFrom || psb.pointer?.exit
      || sc.pointer?.show === false || psb.pointer?.show === false || psb.pointer?.hideAt || sc.pointer?.showAt;
    const ovExit = psb.exit?.pointer ?? null, ovRange = sc.ranges[0]?.pointer ?? null;
    if (ovExit && ovRange && ovExit !== ovRange) warn(`${prev.id} -> ${id}: exit.pointer "${ovExit}" and the first range's pointer "${ovRange}" disagree; using "${ovExit}"`);
    if (!treated) entry = treat({ cut: 0, px: dist(prev.pointerEnd, startPoint), override: ovExit ?? ovRange, label: `${prev.id}→${id}`, tail: tail0 });
    if (entry?.kind === "fade") prev.pointer.fadeOut({ end: prev.duration });
  }
  const p = new Pointer({ id: `${id}-ptr`, point: entry?.kind === "bridge" ? prev.pointerEnd : startPoint, shape: shape0 });
  if (sc.pointer?.show !== false) p.show(sc.pointer?.showAt ? at(sc.pointer.showAt) : 0);
  if (sc.pointer?.hideAt) p.hide(at(sc.pointer.hideAt));
  if (entry?.kind === "bridge") p.move({ from: prev.pointerEnd, to: tail0 ? tail0.e.to : startPoint, start: 0, end: entry.seconds });
  else if (tail0) p.move({ from: startPoint, to: tail0.e.to, start: 0, end: tail0.end });
  if (entry?.kind === "fade") p.fadeIn({ cut: 0, hidden: true, after: entry.after, dur: entry.fadeIn });
  const queue = [];
  const parkFrom = new Map(); // move -> the park point it now starts from
  const firstMove = firstKeptMove;
  for (const e of tk.events) {
    if (e.type === "move" && enterFrom && e === firstMove) {
      // the pointer enters from off the frame: same target, start moved off the frame
      const from = enterFrom;
      queue.push({ t: e.t, f: () => p.move({ from, to: e.to, start: M.map(clampT(e.t)), end: M.map(clampT(e.tEnd)) }) });
      continue;
    }
    if (e.type === "move" && kept(e.t) && kept(e.tEnd)) {
      if (!M.contiguous(clampT(e.t), clampT(e.tEnd))) { warn(`${id}: move "${e.label}" crosses a cut; skipped`); continue; }
      queue.push({ t: e.t, f: () => p.move({ from: parkFrom.get(e) ?? e.from, to: e.to, control: parkFrom.has(e) ? undefined : e.control, start: M.map(clampT(e.t)), end: M.map(clampT(e.tEnd)) }) });
    } else if (e.type === "move" && (kept(e.t) || kept(e.tEnd)) && !tails.has(e)) warn(`${id}: move "${e.label}" is only partly kept; skipped`);
    if (e.type === "down" && kept(e.t)) {
      const t = M.map(clampT(e.t));
      if (pushAt !== null && t > pushAt) continue;
      queue.push({ t: e.t, f: () => p.click({ at: t, point: e.at }) });
      const seg = M.ranges.find((r) => e.t >= r.srcIn - 1e-9 && e.t <= r.srcOut + 1e-9);
      cues.push({ t: filmStart + t + 1 / FPS, type: "click", label: e.label, ...(seg?.timelapse ? { inTimelapse: true } : {}) });
    }
  }
  // cursor shape changes, dropping hover flicker shorter than 0.12 s
  for (let i = 0; i < curs.length; i++) {
    const c = curs[i];
    if (!kept(c.t) || c.t <= srcIn) continue;
    if ((curs[i + 1]?.t ?? Infinity) - c.t < 0.12) continue;
    queue.push({ t: c.t, f: () => p.shape({ at: M.map(c.t), shape: shapeForCursor(c.cursor) }) });
  }
  // after a cut inside the scene, put the pointer where the mouse was in the new range: bridged or
  // faded when it moved far (montage slices cut on the beat by design and are left as cuts)
  M.ranges.forEach((r, k) => {
    const before = M.ranges[k - 1];
    if (!before || Math.abs(before.srcOut - r.srcIn) <= 1e-6) return;
    const montage = ranges[before.range]?.montage || ranges[r.range]?.montage;
    const visible = r.filmIn >= showT && r.filmIn <= hideT;
    const override = r.range !== before.range ? ranges[r.range]?.pointer ?? null : null;
    const tail = tailAt(r);
    queue.push({ t: r.srcIn - 1e-6, f: () => {
      const q = pointerAt(tk.events, r.srcIn, tk.pointerStart);
      const tr = montage || !visible ? null : treat({ cut: r.filmIn, px: dist(p.pos, q), override, label: `${id} range ${before.range + 1}→${r.range + 1}`, tail });
      if (tr?.kind === "bridge") { p.move({ from: p.pos, to: tail ? tail.e.to : q, start: r.filmIn, end: r.filmIn + tr.seconds }); return; }
      if (tr?.kind === "fade") { p.fadeOut({ end: r.filmIn }); p.fadeIn({ cut: r.filmIn, after: tr.after, dur: tr.fadeIn }); }
      p.tl.set(`#${id}-ptr`, { x: q.x * K, y: q.y * K }, r.filmIn); p.pos = q;
      if (tail) p.move({ from: q, to: tail.e.to, start: r.filmIn, end: tail.end });
    } });
  });
  // park: move the resting pointer off a hover target / a tile it would hide; the next logged move
  // then starts from the park point (same target, so the footage's hover states still line up)
  for (const pk of sc.pointer?.park ?? []) {
    const tPark = anchorTime(tk, pk.at);
    queue.push({ t: tPark, f: () => { const d = moveDuration(p.pos, pk.to); const t0 = M.map(tPark); p.move({ to: pk.to, start: t0, end: t0 + d }); } });
    const next = tk.events.find((e) => e.type === "move" && e.t > tPark);
    if (next) parkFrom.set(next, pk.to);
  }
  queue.sort((a, b) => a.t - b.t).forEach((q) => q.f());
  // exit before the cut: "fade" (0.25 s) or "slide" off the nearest (or given) frame edge
  const ex = sc.pointer?.exit;
  if (ex) {
    const end = exit === "push" ? pushAt : duration;
    const busyMove = tk.events.find((e) => e.type === "move" && kept(e.t) && M.map(clampT(e.tEnd)) > end - 1.0);
    if (busyMove) warn(`${id}: pointer exit overlaps move "${busyMove.label}"`);
    if (ex.type === "fade") {
      const t0 = snapTo(end - (ex.before ?? 0.45), FPS);
      p.tl.fromTo(`#${id}-ptr-press`, { opacity: 1 }, { opacity: 0, duration: 0.25, ease: "power2.in" }, t0);
    } else {
      const here = p.pos;
      const edges = { left: here.x, right: CAPTURE.width - here.x, top: here.y, bottom: CAPTURE.height - here.y };
      const edge = ex.edge ?? Object.entries(edges).sort((a, b) => a[1] - b[1])[0][0];
      const to = edgePoint(edge, here);
      const d = moveDuration(here, to);
      p.move({ to, start: snapTo(end - 0.1 - d, FPS), end: snapTo(end - 0.1, FPS) });
    }
  }

  const caps = (sc.captions ?? []).map((c) => {
    const start = snapTo(filmStart + at(c.at), FPS);
    let end = c.end ? snapTo(filmStart + at(c.end), FPS) : snapTo(start + (c.hold ?? captionHold(c.text)), FPS);
    // a caption ends with its scene (0.1 s before the cut) unless it is meant to carry over
    const lastOk = snapTo(filmStart + duration - 0.1, FPS);
    if (end > lastOk && !c.overCut) end = lastOk;
    return { text: c.text, start, end, variant: c.variant };
  });
  // time-lapse tags: in the band on the left, at least 48 px clear of any caption plate on screen
  // (16:9), or on their own row above the caption (portrait, square): lib/tag.mjs tagPlacement
  const tags = M.ranges
    .filter((r) => r.timelapse && r.filmIn < duration)
    // pieces of one time-lapse range split by an excise share one tag
    .reduce((acc, r) => { const last = acc[acc.length - 1]; if (last && last.range === r.range) last.end = r.filmIn + r.filmDur; else acc.push({ range: r.range, start: r.filmIn, end: r.filmIn + r.filmDur, label: r.timelapse.label, rate: r.rate }); return acc; }, [])
    .map((g, i) => {
      const a = filmStart + g.start, b = filmStart + Math.min(duration, g.end);
      const place = tagPlacement(caps.filter((c) => c.start < b && c.end > a).map((c) => c.text));
      if (!place.clear) warn(`${id}: time-lapse tag ${i} cannot clear the caption by 48 px inside action-safe (x ${Math.round(place.want)})`);
      return timelapseTag({ id: `${id}-tl${i}`, start: g.start, end: Math.min(duration, g.end), label: g.label, rate: g.rate, x: place.x, y: place.y });
    });

  const clip = cutClip(id, tk, M, sc.holdFrames ?? []);
  // emitted after the next scene is built: a fade at the cut adds to this scene's pointer
  const emit = () => sceneFile({ id, duration, ...stage({
    id,
    video: { src: `assets/footage/${id}.mp4`, start: 0, duration, mediaStart: 0 },
    masked: spots,
    overlay: [p.part()],
    extra: [cam.part()],
    outside: tags,
  }) });
  // edl ranges: a montage slice is marked, so the audit can tell its beat cuts from other cuts
  // and a fit-audio hold carries its line, so the audit reads it as the voice speaking, not dead air
  const edlRanges = M.ranges.map((r) => (ranges[r.range]?.montage ? { ...r, montage: true } : ranges[r.range]?.fit ? { ...r, fit: ranges[r.range].fit } : r));
  return { id, sb: sc, duration, emit, exit, cues, captions: caps, mapping: M, edlRanges, clip, pointer: p, pointerEnd: p.pos };
}

// ---------- assemble ----------
const TITLE = sb.title?.duration ?? 8;
const END = sb.end?.duration ?? 7;
// end-card wipe start: its cut is start + 0.45 (2.05 puts the cut one 2.5 s bar after the end card starts)
const END_WIPE = sb.end?.wipeStart ?? 2.4;

// ---------- script-first timing (--fit-audio <placement.json>) ----------
/**
 * Picture-first is the default: the voice is written to the picture's windows. With fit-audio the
 * picture makes room for the voice: every placed line whose clip (end - start, or `duration`) plus
 * the gap is longer than its window gets a stretch (an untagged slow hold) on the longest rest
 * moment inside that window, adding exactly the missing seconds (rounded up to the frame grid).
 *
 * Matching: a line belongs to its `scene` ("title", "end" or a storyboard scene id). Its window
 * opens at its `anchor` (a ref or { ref, offset, edge } into the scene's take) when it has one, else
 * at its `start`, read on the clock of this storyboard built without fit-audio (the cut the voice was
 * placed on; placement.json's `duration` must match it unless every line has an anchor). The window
 * closes at the next line of the same scene (placement order) or at the scene's cut. Each line keeps
 * its source moment, so a line after a stretch moves later with its picture.
 *
 * Refuses (exit 1, nothing written) when a short line is on the title or end card (no footage to
 * hold), when it needs more than `max` seconds, or when its window has no rest moment of 0.4 s.
 */
const FIT_MIN_REST = 0.4, FIT_EDGE = 0.15, FIT_HALF = 0.25;
function fitAudioPlan() {
  const spec0 = opts["fit-audio"] ?? sb.fitAudio ?? null;
  if (!spec0) return null;
  if (spec0 === true) throw new Error("--fit-audio needs the voice placement: --fit-audio voiceover/placement.json");
  const spec = typeof spec0 === "string" ? { placement: spec0 } : spec0;
  const path = typeof opts["fit-audio"] === "string" ? resolve(opts["fit-audio"]) : resolve(dirname(sbPath), spec.placement ?? "");
  if (!existsSync(path)) throw new Error(`fit-audio: no placement at ${path}`);
  const GAP = Number(opts["fit-gap"] ?? spec.gap ?? 0.3), MAX = Number(opts["fit-max"] ?? spec.max ?? 6);
  if (!(GAP >= 0) || !(MAX > 0)) throw new Error(`fit-audio: --fit-gap must be >= 0 and --fit-max > 0 (got ${GAP}, ${MAX})`);
  const pj = JSON.parse(readFileSync(path, "utf8"));
  const raw = Array.isArray(pj) ? pj : pj.lines;
  if (!Array.isArray(raw)) throw new Error(`fit-audio: ${path} has no "lines"`);
  const ids = new Set(["title", "end", ...sb.scenes.map((s) => s.id)]);
  const lines = raw.map((l, i) => {
    const id = String(l.key ?? l.id ?? `line ${i + 1}`);
    const dur = typeof l.duration === "number" ? l.duration : l.end - l.start;
    if (!ids.has(l.scene)) throw new Error(`fit-audio: ${id} is in scene ${JSON.stringify(l.scene)}, which this storyboard does not have`);
    if (!(dur > 0)) throw new Error(`fit-audio: ${id} has no length (want end > start, or duration)`);
    if (l.anchor && (l.scene === "title" || l.scene === "end")) throw new Error(`fit-audio: ${id}: an anchor needs a footage scene, not the ${l.scene} card`);
    if (!l.anchor && typeof l.start !== "number") throw new Error(`fit-audio: ${id} has neither start nor anchor`);
    return { id, scene: l.scene, start: l.start, dur, anchor: typeof l.anchor === "string" ? { ref: l.anchor } : l.anchor ?? null };
  });

  // the cut the voice was placed on: this storyboard without fit-audio
  const pre = new Map();
  let t0 = TITLE;
  for (const sc of sb.scenes) { const c = sceneCut(sc, t0, [], true); pre.set(sc.id, { start: t0, c }); t0 = snapTo(t0 + c.duration, FPS); }
  const preEnd = t0, preTotal = snapTo(t0 + END, FPS);
  const clockOk = typeof pj.duration !== "number" || Math.abs(pj.duration - preTotal) <= 1.5 / FPS;
  const off = [];
  for (const l of lines) {
    if (l.anchor) { const p = pre.get(l.scene); l.src = snapTo(anchorTime(p.c.tk, l.anchor), p.c.grid); continue; }
    const [s0, len] = l.scene === "title" ? [0, TITLE] : l.scene === "end" ? [preEnd, END] : [pre.get(l.scene).start, pre.get(l.scene).c.duration];
    const local = l.start - s0;
    // the title card's clock runs from 0 in any cut; every other unanchored line needs this cut's clock
    if ((!clockOk && l.scene !== "title") || local < -1.5 / FPS || local >= len) { off.push(`${l.id} (${l.scene}) at ${l.start.toFixed(2)} s, ${l.scene} is ${s0.toFixed(2)}-${(s0 + len).toFixed(2)} s`); continue; }
    l.local = Math.max(0, local);
    if (l.scene !== "title" && l.scene !== "end") l.src = pre.get(l.scene).c.M.inverse(l.local);
  }
  if (off.length)
    throw new Error(`fit-audio: ${path} is not on this cut's clock (${clockOk ? off.slice(0, 4).join("; ") + (off.length > 4 ? `; +${off.length - 4} more` : "") : `it is ${pj.duration.toFixed(2)} s long, this cut ${preTotal.toFixed(2)} s, and ${off.length} line(s) have no anchor`}). Re-place the voice on this cut first (voiceover/fitcheck.py, then place.py --windows), or give the lines an "anchor"`);
  const byScene = new Map();
  for (const l of lines) byScene.set(l.scene, [...(byScene.get(l.scene) ?? []), l]);
  for (const [sid, ls] of byScene) for (let i = 1; i < ls.length; i++)
    if ((ls[i].src ?? ls[i].local) < (ls[i - 1].src ?? ls[i - 1].local)) throw new Error(`fit-audio: ${ls[i].id} starts before ${ls[i - 1].id} in ${sid}: lines must be in film order`);

  const refused = [], fitAudio = [], printed = [];
  const addedBy = new Map();
  const r3 = (x) => Math.round(x * 1000) / 1000;
  const say = (l, win, fs, fe, toNext) => `${l.id} (${l.scene}) speaks ${l.dur.toFixed(2)} s + ${GAP.toFixed(2)} s gap in a ${win.toFixed(2)} s window (film ${fs.toFixed(2)}-${fe.toFixed(2)} s, to ${toNext ? "the next line" : "the cut"})`;
  // title and end cards hold no footage: their lines must fit as they are
  for (const card of ["title", "end"]) {
    const ls = byScene.get(card) ?? [];
    const s0 = card === "title" ? 0 : preEnd, len = card === "title" ? TITLE : END;
    ls.forEach((l, i) => {
      const fe = Math.min(len, ls[i + 1]?.local ?? Infinity), win = fe - l.local, short = l.dur + GAP - win;
      if (short > 1e-6) refused.push(`${say(l, win, s0 + l.local, s0 + fe, ls[i + 1])}: ${short.toFixed(2)} s short, and the ${card} card has no footage to hold (lengthen ${card}.duration, or shorten the line)`);
    });
  }
  /**
   * A line's source moment -> scene-local film seconds. A moment this cut no longer keeps (a montage
   * slice one frame shorter after a hold moved the beat) snaps to the next kept frame, as
   * voiceover/remap.py does; past the last kept frame, the scene's end.
   */
  const near = (M, src, end) => {
    const t = M.map(src);
    if (t !== null) return t;
    const after = M.ranges.filter((r) => r.srcIn >= src).sort((p, q) => p.srcIn - q.srcIn)[0];
    return after ? after.filmIn : end;
  };
  /** The best rest moment in scene-local film [fs, fe] of cut c: { src: [a, b], span }, or null. */
  const restIn = (c, fs, fe) => {
    let best = null;
    for (const r of c.M.ranges) {
      const plain = c.plainOf(r.range);
      if (!plain) continue;
      const f0 = Math.max(fs, r.filmIn), f1 = Math.min(fe, r.filmIn + r.filmDur);
      if (f1 - f0 < FIT_MIN_REST) continue;
      const lo = Math.max(r.srcIn + (f0 - r.filmIn) * r.rate, snapTo(anchorTime(c.tk, plain.from), c.grid));
      const hi = Math.min(r.srcIn + (f1 - r.filmIn) * r.rate, snapTo(anchorTime(c.tk, plain.to), c.grid));
      for (const s of restSpans(c.tk, lo, hi)) if (s.length >= FIT_MIN_REST - 1e-9 && (!best || s.length > best.length + 1e-9 || (Math.abs(s.length - best.length) <= 1e-9 && s.quiet && !best.quiet))) best = s;
    }
    if (!best) return null;
    // the hold sits mid-rest, the frame farthest from the events before and after it
    const mid = (best.from + best.to) / 2, half = Math.max(1 / c.grid, Math.min(FIT_HALF, (best.length - 2 * FIT_EDGE) / 2));
    const a = Math.ceil((mid - half) * c.grid - 1e-6) / c.grid;
    const b = Math.max(a + 1 / c.grid, Math.floor((mid + half) * c.grid + 1e-6) / c.grid);
    return { src: [a, b], span: best };
  };

  return {
    GAP, MAX, path, lines: lines.length, fitAudio, printed, refused,
    added: (sid) => addedBy.get(sid) ?? 0,
    /** The holds scene sc needs at filmStart (a fixed point: a hold can move a montage's beat). */
    fitScene(sc, filmStart) {
      const ls = byScene.get(sc.id) ?? [];
      const fits = [], out = new Set();
      for (let pass = 0; pass < 4 && ls.length; pass++) {
        const c = sceneCut(sc, filmStart, fits, true);
        let changed = false;
        ls.forEach((l, i) => {
          if (out.has(l)) return;
          const next = ls[i + 1];
          const fs = near(c.M, l.src, c.duration), fe = next ? near(c.M, next.src, c.duration) : c.duration;
          if (pass === 0 && l.anchor && c.M.map(l.src) === null) warn(`fit-audio: ${l.id}'s anchor falls in footage ${sc.id} leaves out; its window opens at the next kept frame`);
          const win = fe - fs, short = l.dur + GAP - win;
          if (short <= 1e-6) return;
          const add = Math.ceil((short - 1e-9) * c.grid) / c.grid;
          const f = fits.find((x) => x.line === l.id);
          if (f) { f.added = snapTo(f.added + add, c.grid); f.duration = snapTo(f.src[1] - f.src[0] + f.added, c.grid); changed = true; return; }
          const what = say(l, win, filmStart + fs, filmStart + fe, next);
          if (add > MAX + 1e-9) { out.add(l); refused.push(`${what}: ${short.toFixed(2)} s short, more than --fit-max ${MAX} s (re-cut the scene, or shorten the line)`); return; }
          const spot = restIn(c, fs, Math.min(fe, c.pushAt ?? Infinity));
          if (!spot) { out.add(l); refused.push(`${what}: ${short.toFixed(2)} s short, and no rest moment of ${FIT_MIN_REST} s in that window (the pointer moves, the UI is busy, or the footage is a time-lapse or montage throughout: re-cut the scene, or move the line)`); return; }
          fits.push({ line: l.id, scene: sc.id, src: spot.src, added: add, duration: snapTo(spot.src[1] - spot.src[0] + add, c.grid), span: spot.span, what });
          changed = true;
        });
        if (!changed) break;
      }
      for (const f of fits) if (f.added > MAX + 1e-9) refused.push(`${f.what}: needs ${f.added.toFixed(2)} s, more than --fit-max ${MAX} s`);
      return fits;
    },
    /** After the scene is built: where each hold landed, and a check that every line now fits. */
    record(built, fits) {
      const ls = byScene.get(built.id) ?? [];
      for (const f of fits) {
        const at = built.start + built.mapping.map(f.src[0]);
        const reason = `${f.what}; held source ${f.src[0].toFixed(2)}-${f.src[1].toFixed(2)} s for ${f.duration.toFixed(2)} s, mid-rest (${f.span.length.toFixed(2)} s with nothing logged${f.span.quiet ? ", DOM quiet" : ""})`;
        fitAudio.push({ line: f.line, scene: f.scene, at: r3(at), added: r3(f.added), hold: r3(f.duration), reason });
        printed.push(`fit: ${f.line} +${f.added.toFixed(2)} s at ${at.toFixed(2)} s (${f.scene}; a ${f.duration.toFixed(2)} s hold on a ${f.span.length.toFixed(2)} s rest)`);
        addedBy.set(built.id, (addedBy.get(built.id) ?? 0) + f.added);
      }
      ls.forEach((l, i) => {
        const fs = near(built.mapping, l.src, built.duration), fe = ls[i + 1] ? near(built.mapping, ls[i + 1].src, built.duration) : built.duration;
        if (l.dur + GAP - (fe - fs) > 1e-6 && !refused.some((m) => m.startsWith(`${l.id} `)))
          warn(`fit-audio: ${l.id} is still ${(l.dur + GAP - (fe - fs)).toFixed(3)} s short after the holds`);
      });
    },
  };
}
const FIT = fitAudioPlan();

let t = TITLE;
const scenes = [];
for (const sc of sb.scenes) {
  const fits = FIT ? FIT.fitScene(sc, t) : [];
  const built = buildScene(sc, scenes[scenes.length - 1] ?? null, t, fits);
  built.start = t;
  if (FIT) FIT.record(built, fits);
  t = snapTo(t + built.duration, FPS);
  scenes.push(built);
}
pointerTreatments.sort((a, b) => a.at - b.at);
const pointerLines = pointerTreatments.map((x) => `pointer: ${x.kind} ${x.px} px at ${x.at.toFixed(2)} s (${x.cut}${x.by === "storyboard" ? ", storyboard" : ""}${x.note ? `; ${x.note}` : ""})`);
const tEnd = t;
const total = snapTo(tEnd + END, FPS);
const captions = scenes.flatMap((s) => s.captions).sort((a, b) => a.start - b.start);
if (sb.end?.lastCaption) captions.push(sb.end.lastCaption);
for (const p of lintCaptions(captions)) warn(`captions: ${p}`);
const cues = [
  { t: 1.45, type: "transition", kind: "wipe", where: "title" },
  ...scenes.flatMap((s) => s.cues),
  ...scenes.slice(1).filter((s, i) => scenes[i].exit === "hard").map((s) => ({ t: s.start, type: "transition", kind: "cut", to: s.id })),
  { t: tEnd, type: "transition", kind: "cut", to: "end" },
  { t: tEnd + END_WIPE, type: "transition", kind: "wipe", where: "end" },
].map((c) => ({ ...c, t: Math.round(c.t * 1000) / 1000 })).sort((a, b) => a.t - b.t);

// ---------- durations: actual vs target, one table to decide trims from ----------
const filmTarget = { min: 180, max: 195, ...(sb.target ?? {}) };
const fmt = (x) => (x === undefined || x === null ? "" : `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, "0")}`);
const rows = [
  { scene: "title", target: sb.title?.target ?? TITLE, actual: TITLE },
  ...scenes.flatMap((sc, i) => {
    const row = { scene: sc.id, target: sb.scenes[i].target, actual: sc.duration, excised: sc.mapping.excised.reduce((a, g) => a + g.to - g.from, 0), ...(FIT ? { fit: FIT.added(sc.id) } : {}) };
    // story scenes cut from several takes: a subtotal row after the group's last part
    const g = sb.scenes[i].group;
    if (!g || sb.scenes[i + 1]?.group === g) return [row];
    const members = sb.scenes.map((x, k) => ({ x, k })).filter(({ x }) => x.group === g);
    if (members.length < 2) return [row];
    const gt = sb.groups?.[g]?.target;
    return [row, { scene: `= ${g}${sb.groups?.[g]?.name ? " " + sb.groups[g].name : ""}`, target: gt, actual: members.reduce((a, { k }) => a + scenes[k].duration, 0), subtotal: true }];
  }),
  { scene: "end", target: sb.end?.target ?? END, actual: END },
];
const table = rows.map((r) => ({
  scene: r.scene,
  target: r.target === undefined ? "-" : `${r.target.toFixed(2)} s`,
  actual: `${r.actual.toFixed(2)} s`,
  delta: r.target === undefined ? "-" : `${r.actual - r.target >= 0 ? "+" : ""}${(r.actual - r.target).toFixed(2)} s`,
  "excised (source)": r.excised ? `${r.excised.toFixed(2)} s` : "",
  // --fit-audio: the seconds the holds added for the voice
  ...(FIT ? { fit: r.fit ? `+${r.fit.toFixed(2)} s` : "" } : {}),
}));
const leaf = rows.filter((r) => !r.subtotal);
const targetSum = leaf.every((r) => r.target !== undefined) ? leaf.reduce((a, r) => a + r.target, 0) : null;
const spotCount = sb.scenes.reduce((a, x) => a + (x.spotlights?.length ?? 0), 0);
if (spotCount > 6) warn(`${spotCount} spotlights in the film (the plan allows at most 6)`);
table.push({ scene: "TOTAL", target: targetSum === null ? `${fmt(filmTarget.min)}-${fmt(filmTarget.max)}` : `${targetSum.toFixed(2)} s`, actual: `${total.toFixed(2)} s (${fmt(total)})`, delta: total < filmTarget.min ? `${(total - filmTarget.min).toFixed(2)} s under ${fmt(filmTarget.min)}` : total > filmTarget.max ? `+${(total - filmTarget.max).toFixed(2)} s over ${fmt(filmTarget.max)}` : `in range ${fmt(filmTarget.min)}-${fmt(filmTarget.max)}`, "excised (source)": "", ...(FIT ? { fit: FIT.fitAudio.length ? `+${FIT.fitAudio.reduce((a, f) => a + f.added, 0).toFixed(2)} s (${FIT.fitAudio.length})` : "none" } : {}) });
const durations = { filmTarget, total, scenes: rows };
const edlJson = () => JSON.stringify({ fps: FPS, clipFps: CLIP_FPS, durations, scenes: scenes.map((s) => ({ id: s.id, start: s.start, duration: s.duration, exit: s.exit, ranges: s.edlRanges, excised: s.mapping.excised, gapsAccepted: s.mapping.gapsAccepted })), pointerTreatments, ...(FIT ? { fitAudio: FIT.fitAudio } : {}) }, null, 2) + "\n";
const fitLines = FIT ? [...FIT.printed, `fit-audio: ${FIT.lines} lines from ${FIT.path} (gap ${FIT.GAP} s, max ${FIT.MAX} s a line): ${FIT.fitAudio.length ? `${FIT.fitAudio.length} held, +${FIT.fitAudio.reduce((a, f) => a + f.added, 0).toFixed(2)} s` : FIT.refused.length ? "nothing held" : "every line fits, nothing held"}${FIT.refused.length ? `, ${FIT.refused.length} refused` : ""}`] : [];
// a line the picture cannot make room for: show what was added, say why, write nothing
if (FIT?.refused.length) {
  console.table(table);
  for (const l of fitLines) console.log(l);
  console.error(`fit-audio: refused, nothing written. ${FIT.refused.length} line(s) cannot be fitted:\n  ${FIT.refused.join("\n  ")}`);
  process.exit(1);
}

/** --audit: scripts/audit.mjs on the files just written (dir = a dry-out folder, or null for film/). */
function audit(dir) {
  const extra = dir ? ["--edl", join(dir, "edl.json"), "--cues", join(dir, "cues.json"), "--srt", join(dir, "captions.srt"), "--no-holds"] : [];
  const brandArg = typeof opts.brand === "string" ? ["--brand", opts.brand] : [];
  const r = spawnSync(process.execPath, [join(kit, "scripts/audit.mjs"), sbPath, "--project", film, "--takes", takesDir, ...brandArg, ...extra], { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

if (DRY) {
  // --dry-out <dir>: also write the would-be cues.json, edl.json and captions.srt there (nothing else)
  const dryOut = typeof opts["dry-out"] === "string" ? resolve(opts["dry-out"]) : opts.audit ? mkdtempSync(join(tmpdir(), "film-dry-")) : null;
  if (dryOut) {
    const dir = dryOut;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "cues.json"), JSON.stringify({ fps: FPS, duration: total, captions: !NO_CAPTIONS, cues }, null, 2) + "\n");
    writeFileSync(join(dir, "captions.srt"), toSrt(captions));
    writeFileSync(join(dir, "edl.json"), edlJson());
    console.log(`dry run written to ${dir}: cues.json, edl.json, captions.srt`);
  }
  console.log(`dry run: takes ${takesDir}${BRAND_NOTE}`);
  console.table(table);
  for (const l of pointerLines) console.log(l);
  for (const l of fitLines) console.log(l);
  if (warnings.length) console.warn("warnings:\n  " + warnings.join("\n  "));
  if (opts.audit) audit(dryOut);
  process.exit(0);
}

const madeProject = ensureProject(film);
if (madeProject.length) console.log(`project ${film}: wrote ${madeProject.join(", ")}`);
mkdirSync(join(film, "compositions"), { recursive: true });
// title/end lines: the storyboard's, else the brand's cards
writeFileSync(join(film, "compositions/title.html"), titleScene({ id: "title", creatives, duration: TITLE, lines: sb.title?.lines ?? BRAND.cards.title }));
for (const s of scenes) writeFileSync(join(film, `compositions/${s.id}.html`), s.emit());
writeFileSync(join(film, "compositions/end.html"), endScene({ id: "end", creatives, duration: END, wipeStart: END_WIPE, lines: sb.end?.lines ?? BRAND.cards.end }));
writeFileSync(join(film, "compositions/captions.html"), captionsScene({ id: "captions", duration: total, items: captions }));
writeFileSync(join(film, "cues.json"), JSON.stringify({ fps: FPS, duration: total, captions: !NO_CAPTIONS, cues }, null, 2) + "\n");
writeFileSync(join(film, "captions.srt"), toSrt(captions));
writeFileSync(
  join(film, "edl.json"),
  edlJson(),
);

const host = (id, start, duration, z, kind = "graphics") =>
  `      <div id="${id}" data-composition-id="${id}" data-composition-src="compositions/${id}.html" data-start="${n(start)}" data-duration="${n(duration)}" data-track-index="${z}" data-track-kind="${kind}" data-width="${FILM.width}" data-height="${FILM.height}" style="z-index:${z}"></div>`;
// Render-time motion blur showed no smear on this film's movers in 0.9.16 (tested capture and filter
// tiers); it stays off unless the storyboard asks for it. Whips carry the speed instead.
const blur = sb.motionBlur === true ? ' data-motion-blur="on"' : "";
writeFileSync(
  join(film, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${FILM.width}, height=${FILM.height}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${FILM.width}px; height: ${FILM.height}px; overflow: hidden; background: ${COLOR.ink}; }
      #root { position: relative; width: 100%; height: 100%; background: ${COLOR.ink}; }
    </style>
  </head>
  <body>
    <!-- Generated by build.mjs from ${sbPath.split("/").pop()}. Edit the storyboard or lib/, not this file. -->
    <div id="root" data-composition-id="main" data-start="0" data-duration="${n(total)}" data-fps="${FPS}"${blur} data-width="${FILM.width}" data-height="${FILM.height}">
${host("title", 0, TITLE, 1)}
${scenes.map((s, i) => host(s.id, s.start, s.duration, 2 + i)).join("\n")}
${host("end", tEnd, END, 2 + scenes.length)}
${NO_CAPTIONS ? "      <!-- captions track left out (--no-captions) -->" : host("captions", 0, total, 50, "captions")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`,
);

console.log(`project ${film}, takes ${takesDir}${BRAND_NOTE}`);
console.log(`film ${n(total)} s @ ${FPS} fps (clips ${CLIP_FPS} fps): title 0-${TITLE}, ${scenes.map((s) => `${s.id} ${n(s.start)}-${n(s.start + s.duration)}`).join(", ")}, end ${n(tEnd)}-${n(total)}`);
console.log(`${captions.length} captions${NO_CAPTIONS ? " (not mounted: --no-captions)" : ""}, ${cues.length} cues -> cues.json, captions.srt, edl.json${EMIT_ONLY ? " (--emit-only: no footage cut)" : ""}`);
console.table(table);
for (const l of pointerLines) console.log(l);
for (const l of fitLines) console.log(l);
if (warnings.length) console.warn("warnings:\n  " + warnings.join("\n  "));
if (opts.audit) audit(null);
