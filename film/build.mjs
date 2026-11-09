// The real build: storyboard.json + take folders -> pre-cut scene clips, scene compositions,
// captions, index.html, cues.json and the .srt.
//
//   node build.mjs [storyboard.json] [--takes <dir>] [--brand <brand.json>] [--no-cut] [--no-captions]
//                 [--dry [--dry-out <dir>]] [--audit]
//
// --audit runs scripts/audit.mjs on what was just written (holds, pointer jumps at cuts, dead air,
// caption lint, caption claims) and exits with its status; with --dry it audits the would-be files
// (in --dry-out, or a temporary folder) without the holds check.
//
// The storyboard defaults to film/storyboard.json. Take folders come from --takes, else WALKTHROUGH_TAKES,
// else the storyboard's "takesDir" (relative to the storyboard), else ../takes next to film/.
//
// One mapping per scene (lib/edl.mjs) turns source time into film time; the footage cut, the
// pointer, clicks, cursor shapes, camera, spotlights, captions, time-lapse tags and sound cues all
// go through it, so a re-cut can never desync them. Event references are "type:label" (or
// "type:label#n") into the take's events.json (schema "walkthrough-take/1"; "kleber-take/1" is
// accepted too, see lib/edl.mjs).

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND, CAPTURE, COLOR, FILM, K, WINDOW, cliArgs } from "./lib/config.mjs";
import { n, sceneFile } from "./lib/emit.mjs";
import { Pointer, shapeForCursor, moveDuration } from "./lib/pointer.mjs";
import { Camera } from "./lib/camera.mjs";
import { spotlight } from "./lib/spotlight.mjs";
import { stage } from "./lib/stage.mjs";
import { captionsScene, captionHold, lintCaptions, toSrt } from "./lib/captions.mjs";
import { titleScene, endScene } from "./lib/titlecards.mjs";
import { timelapseTag, TAG_WIDTH, plateWidth } from "./lib/tag.mjs";
import { buildMapping, anchorTime, findRef, refBox, gridFps, snapTo, checkTakeSchema } from "./lib/edl.mjs";
import { parseIndex } from "./lib/takeindex.mjs";
import { pointerAt } from "../recorder/motion.mjs";

const film = dirname(fileURLToPath(import.meta.url));
const { opts, positional } = cliArgs();
const sbPath = resolve(positional.find((a) => a.endsWith(".json")) ?? join(film, "storyboard.json"));
if (!existsSync(sbPath)) throw new Error(`no storyboard at ${sbPath} (copy storyboard.example.json to storyboard.json, or pass a path)`);
const DRY = Boolean(opts.dry); // compute and report only: no ffmpeg, no files written
const CUT = !opts["no-cut"] && !DRY;
// --no-captions: same film to the frame, but the captions track is not mounted (voiceover twin).
// Caption timing still drives tag placement, cues and the .srt, so the picture is otherwise identical.
const sb = JSON.parse(readFileSync(sbPath, "utf8"));
const NO_CAPTIONS = Boolean(opts["no-captions"]) || sb.captions === false;
const FPS = FILM.fps;
const CLIP_FPS = sb.clipFps ?? FPS;
const takesArg = typeof opts.takes === "string" ? resolve(opts.takes) : process.env.WALKTHROUGH_TAKES ? resolve(process.env.WALKTHROUGH_TAKES) : null;
const takesDir = takesArg ?? (sb.takesDir ? (isAbsolute(sb.takesDir) ? sb.takesDir : resolve(dirname(sbPath), sb.takesDir)) : resolve(film, "../takes"));
if (!existsSync(takesDir)) throw new Error(`takes folder not found: ${takesDir} (pass --takes <dir> or set "takesDir" in the storyboard)`);
// the creatives manifest is only needed to write the title and end cards (not for --dry)
const manifestPath = join(film, "assets/creatives/manifest.json");
const creatives = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
if (!creatives && !DRY) throw new Error("no assets/creatives/manifest.json: run node scripts/sync-assets.mjs (or node scripts/make-placeholder.mjs for stand-ins)");
const warnings = [];
const BRAND_NOTE = `, brand ${BRAND.name}`;
const warn = (m) => warnings.push(m);

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
      { from: r.from ?? ws, to: split },
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
  const before = ranges.slice(0, i).map((x) => ({ ...x, from: { ...x.from }, to: typeof x.to === "number" ? x.to : { ...x.to } }));
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
    return { from: s0, to: s0 + L / grid };
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
    const tj = existsSync(join(dir, "take.json")) ? JSON.parse(readFileSync(join(dir, "take.json"), "utf8")) : {};
    // sync.keep {from, to}: the footage between the last start flash and the first end flash
    takes.set(name, { ...ev, dir, master: join(dir, ev.video?.file ?? "master.mp4"), keep: tj.sync?.keep ?? null });
  }
  return takes.get(name);
}

// ---------- footage cut ----------
function cutClip(sceneId, tk, mapping, holdFrames = []) {
  const out = join(film, "assets/footage", `${sceneId}.mp4`);
  const st = statSync(tk.master);
  const spec = JSON.stringify({ src: tk.master, size: st.size, mtime: st.mtimeMs, ranges: mapping.ranges, fps: CLIP_FPS, hb: sb.heartbeatCover ?? null, hold: holdFrames, v: 5 });
  const specFile = out.replace(/\.mp4$/, ".cut.json");
  if (!CUT || (existsSync(out) && existsSync(specFile) && readFileSync(specFile, "utf8") === spec)) return out;
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

// ---------- one stage scene ----------
function buildScene(sc, prevExit, filmStart) {
  const tk = take(sc.take);
  const grid = gridFps(FPS, CLIP_FPS, tk.fps);
  const ranges = expandMontage(tk, expandRanges(tk, sc.ranges), filmStart, grid, sc);
  const auto = autoExcise(tk, ranges, grid, sc);
  for (const g of auto.accepted) warn(`${sc.id}: capture gap ${g.from.toFixed(2)} s +${g.ms} ms kept (${g.why}${g.note ? "; " + g.note : ""})`);
  const M = buildMapping(tk, ranges, { grid, excise: [...(sc.excise ?? []), ...auto.excise], warn: (m) => warn(`${sc.id}: ${m}`) });
  M.gapsAccepted = auto.accepted;
  const at = (a) => {
    const src = snapTo(anchorTime(tk, a), grid); // anchors share the range bounds' grid
    const t = M.map(src);
    if (t === null) throw new Error(`${sc.id}: anchor ${JSON.stringify(a)} (source ${src.toFixed(3)} s) falls in cut footage`);
    return snapTo(t, FPS);
  };
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
  const p = new Pointer({ id: `${id}-ptr`, point: enterFrom ?? pointerAt(tk.events, srcIn, tk.pointerStart), shape: shape0 });
  if (sc.pointer?.show !== false) p.show(sc.pointer?.showAt ? at(sc.pointer.showAt) : 0);
  if (sc.pointer?.hideAt) p.hide(at(sc.pointer.hideAt));
  // events within half a frame of the scene's first/last kept frame count as kept (bounds are snapped)
  const tol = 0.5 / grid + 1e-6;
  const clampT = (t) => Math.min(srcEnd, Math.max(srcIn, t));
  const kept = (t) => t >= srcIn - tol && t <= srcEnd + tol && M.map(clampT(t)) !== null;
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
    } else if (e.type === "move" && (kept(e.t) || kept(e.tEnd))) warn(`${id}: move "${e.label}" is only partly kept; skipped`);
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
  // after a cut inside the scene, put the pointer where the mouse was in the new range
  for (const r of M.ranges.slice(1)) {
    const prev = M.ranges[M.ranges.indexOf(r) - 1];
    if (Math.abs(prev.srcOut - r.srcIn) > 1e-6)
      queue.push({ t: r.srcIn, f: () => { const q = pointerAt(tk.events, r.srcIn, tk.pointerStart); p.tl.set(`#${id}-ptr`, { x: q.x * K, y: q.y * K }, r.filmIn); p.pos = q; } });
  }
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
  const tags = M.ranges
    .filter((r) => r.timelapse && r.filmIn < duration)
    // pieces of one time-lapse range split by an excise share one tag
    .reduce((acc, r) => { const last = acc[acc.length - 1]; if (last && last.range === r.range) last.end = r.filmIn + r.filmDur; else acc.push({ range: r.range, start: r.filmIn, end: r.filmIn + r.filmDur, label: r.timelapse.label, rate: r.rate }); return acc; }, [])
    .map((g, i) => {
      const a = filmStart + g.start, b = filmStart + Math.min(duration, g.end);
      const plates = caps.filter((c) => c.start < b && c.end > a).map((c) => FILM.width / 2 - plateWidth(c.text) / 2);
      const x = Math.min(WINDOW.left, ...plates.map((l) => l - 48 - TAG_WIDTH));
      if (x < 96) warn(`${id}: time-lapse tag ${i} cannot clear the caption by 48 px inside action-safe (x ${Math.round(x)})`);
      return timelapseTag({ id: `${id}-tl${i}`, start: g.start, end: Math.min(duration, g.end), label: g.label, rate: g.rate, x: Math.max(96, x) });
    });

  const clip = cutClip(id, tk, M, sc.holdFrames ?? []);
  const s = stage({
    id,
    video: { src: `assets/footage/${id}.mp4`, start: 0, duration, mediaStart: 0 },
    masked: spots,
    overlay: [p.part()],
    extra: [cam.part()],
    outside: tags,
  });
  return { id, duration, file: sceneFile({ id, duration, ...s }), exit, cues, captions: caps, mapping: M, clip };
}

// ---------- assemble ----------
const TITLE = sb.title?.duration ?? 8;
const END = sb.end?.duration ?? 7;
// end-card wipe start: its cut is start + 0.45 (2.05 puts the cut one 2.5 s bar after the end card starts)
const END_WIPE = sb.end?.wipeStart ?? 2.4;
let t = TITLE;
let prevExit = "settle"; // the first scene settles in after the title's hard cut
const scenes = [];
for (const sc of sb.scenes) {
  const built = buildScene(sc, prevExit, t);
  built.start = t;
  t = snapTo(t + built.duration, FPS);
  prevExit = built.exit;
  scenes.push(built);
}
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
    const row = { scene: sc.id, target: sb.scenes[i].target, actual: sc.duration, excised: sc.mapping.excised.reduce((a, g) => a + g.to - g.from, 0) };
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
}));
const leaf = rows.filter((r) => !r.subtotal);
const targetSum = leaf.every((r) => r.target !== undefined) ? leaf.reduce((a, r) => a + r.target, 0) : null;
const spotCount = sb.scenes.reduce((a, x) => a + (x.spotlights?.length ?? 0), 0);
if (spotCount > 6) warn(`${spotCount} spotlights in the film (the plan allows at most 6)`);
table.push({ scene: "TOTAL", target: targetSum === null ? `${fmt(filmTarget.min)}-${fmt(filmTarget.max)}` : `${targetSum.toFixed(2)} s`, actual: `${total.toFixed(2)} s (${fmt(total)})`, delta: total < filmTarget.min ? `${(total - filmTarget.min).toFixed(2)} s under ${fmt(filmTarget.min)}` : total > filmTarget.max ? `+${(total - filmTarget.max).toFixed(2)} s over ${fmt(filmTarget.max)}` : `in range ${fmt(filmTarget.min)}-${fmt(filmTarget.max)}`, "excised (source)": "" });
const durations = { filmTarget, total, scenes: rows };

/** --audit: scripts/audit.mjs on the files just written (dir = a dry-out folder, or null for film/). */
function audit(dir) {
  const extra = dir ? ["--edl", join(dir, "edl.json"), "--cues", join(dir, "cues.json"), "--srt", join(dir, "captions.srt"), "--no-holds"] : [];
  const brandArg = typeof opts.brand === "string" ? ["--brand", opts.brand] : [];
  const r = spawnSync(process.execPath, [join(film, "scripts/audit.mjs"), sbPath, "--takes", takesDir, ...brandArg, ...extra], { stdio: "inherit" });
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
    writeFileSync(join(dir, "edl.json"), JSON.stringify({ fps: FPS, clipFps: CLIP_FPS, durations, scenes: scenes.map((s) => ({ id: s.id, start: s.start, duration: s.duration, exit: s.exit, ranges: s.mapping.ranges, excised: s.mapping.excised, gapsAccepted: s.mapping.gapsAccepted })) }, null, 2) + "\n");
    console.log(`dry run written to ${dir}: cues.json, edl.json, captions.srt`);
  }
  console.log(`dry run: takes ${takesDir}${BRAND_NOTE}`);
  console.table(table);
  if (warnings.length) console.warn("warnings:\n  " + warnings.join("\n  "));
  if (opts.audit) audit(dryOut);
  process.exit(0);
}

mkdirSync(join(film, "compositions"), { recursive: true });
// title/end lines: the storyboard's, else the brand's cards
writeFileSync(join(film, "compositions/title.html"), titleScene({ id: "title", creatives, duration: TITLE, lines: sb.title?.lines ?? BRAND.cards.title }));
for (const s of scenes) writeFileSync(join(film, `compositions/${s.id}.html`), s.file);
writeFileSync(join(film, "compositions/end.html"), endScene({ id: "end", creatives, duration: END, wipeStart: END_WIPE, lines: sb.end?.lines ?? BRAND.cards.end }));
writeFileSync(join(film, "compositions/captions.html"), captionsScene({ id: "captions", duration: total, items: captions }));
writeFileSync(join(film, "cues.json"), JSON.stringify({ fps: FPS, duration: total, captions: !NO_CAPTIONS, cues }, null, 2) + "\n");
writeFileSync(join(film, "captions.srt"), toSrt(captions));
writeFileSync(
  join(film, "edl.json"),
  JSON.stringify({ fps: FPS, clipFps: CLIP_FPS, durations, scenes: scenes.map((s) => ({ id: s.id, start: s.start, duration: s.duration, exit: s.exit, ranges: s.mapping.ranges, excised: s.mapping.excised, gapsAccepted: s.mapping.gapsAccepted })) }, null, 2) + "\n",
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

console.log(`takes ${takesDir}${BRAND_NOTE}`);
console.log(`film ${n(total)} s @ ${FPS} fps (clips ${CLIP_FPS} fps): title 0-${TITLE}, ${scenes.map((s) => `${s.id} ${n(s.start)}-${n(s.start + s.duration)}`).join(", ")}, end ${n(tEnd)}-${n(total)}`);
console.log(`${captions.length} captions${NO_CAPTIONS ? " (not mounted: --no-captions)" : ""}, ${cues.length} cues -> cues.json, captions.srt, edl.json`);
console.table(table);
if (warnings.length) console.warn("warnings:\n  " + warnings.join("\n  "));
if (opts.audit) audit(null);
