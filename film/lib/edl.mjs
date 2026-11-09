// Edit decision list maths: event references, anchors, and the one source-time -> film-time mapping
// every overlay goes through. Pure functions; no DOM, no ffmpeg.

/** gcd-based grid: bounds snap to the coarsest frame grid shared by film, clip and source. */
function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}
export const gridFps = (...fps) => fps.filter(Boolean).map(Math.round).reduce(gcd);
export const snapTo = (t, fps) => Math.round(t * fps) / fps;

/** Take schema ids this reader accepts. Anything else is an error. */
export const TAKE_SCHEMAS = Object.freeze(["walkthrough-take/1"]);
export function checkTakeSchema(events, name = events?.take ?? "?") {
  if (!TAKE_SCHEMAS.includes(events?.schema))
    throw new Error(`take ${name}: unknown schema ${JSON.stringify(events?.schema)} (accepted: ${TAKE_SCHEMAS.join(", ")})`);
  return events;
}

/**
 * The usable span's edge from the take's sync flashes: side "start" -> the end of the last start
 * flash, "end" -> the start of the first end flash. Flashes are labelled "start 1..3" / "end 1..3"
 * (single-flash takes: "start" / "end"; numbered only when numberedOnly). null when there are none.
 */
function flashEdge(take, side, numberedOnly = false) {
  const re = numberedOnly ? new RegExp(`^${side} \\d+$`) : new RegExp(`^${side}( \\d+)?$`);
  const flashes = (take.events ?? []).filter((e) => e.type === "sync" && re.test(e.label ?? ""));
  if (!flashes.length) return null;
  const f = side === "start" ? flashes[flashes.length - 1] : flashes[0];
  return { ...f, label: side, t: side === "start" ? f.t + (f.duration ?? 0) : f.t, tEnd: undefined };
}

/**
 * Find an event by reference "type:label" or "type:label#n" (n-th match, 1-based). type "*" matches
 * any type. Throws with the available labels when nothing matches.
 */
export function findRef(take, ref) {
  // "keep:from" / "keep:to": the take's usable span between its sync flashes (take.json sync.keep;
  // a take without it: the end of the last start flash / the start of the first end flash, two master
  // frames inward, as the recorder pads sync.keep)
  if (ref === "keep:from" || ref === "keep:to") {
    const side = ref.slice(5);
    if (take.keep) return { type: "keep", label: side, t: take.keep[side] };
    const f = flashEdge(take, side === "from" ? "start" : "end");
    if (!f) throw new Error(`take ${take.take} has no sync.keep in take.json and no sync flashes to derive it from`);
    const pad = 2 / (take.fps ?? 60);
    return { type: "keep", label: side, t: side === "from" ? f.t + pad : f.t - pad };
  }
  const i = ref.indexOf(":");
  if (i < 1) throw new Error(`bad event ref "${ref}" (want "type:label" or "type:label#n")`);
  const type = ref.slice(0, i);
  const rest = ref.slice(i + 1);
  const match = (label) => take.events.filter((e) => (type === "*" || e.type === type) && e.label === label);
  // The exact label first (recorder labels may themselves end in " #2"), then "label#n".
  let hits = match(rest);
  let nth = 1;
  if (!hits.length) {
    const m = /^(.*)#(\d+)$/.exec(rest);
    if (m) { hits = match(m[1]); nth = Number(m[2]); }
  }
  // Older storyboards anchor to a bare "sync:start" / "sync:end" (single-flash takes). In a take
  // with three flashes a side ("start 1..3", "end 1..3") and no event labelled exactly that, they
  // mean the edges of the usable span: the end of the last start flash, the start of the first end flash.
  if (!hits.length && type === "sync" && (rest === "start" || rest === "end")) {
    const f = flashEdge(take, rest, true);
    if (f) return f;
  }
  const ev = hits[nth - 1];
  if (!ev) {
    const labels = [...new Set(take.events.filter((e) => e.label).map((e) => `${e.type}:${e.label}`))];
    throw new Error(`no event "${ref}" in take ${take.take}. Known: ${labels.join(", ")}`);
  }
  return ev;
}

/**
 * The visible text the recorder logged for an event (a mark's innerText, a type event's typed
 * text), or null when it has none. Optional: older takes have no text on marks.
 */
export function eventText(take, ref) {
  const ev = findRef(take, ref);
  return typeof ev.text === "string" ? ev.text : null;
}

/** Anchor -> source seconds. { ref, offset = 0, edge = "start" | "end" } or a bare number. */
export function anchorTime(take, a) {
  if (typeof a === "number") return a;
  const ev = findRef(take, a.ref);
  const base = a.edge === "end" ? ev.tEnd ?? ev.t : ev.t;
  return base + (a.offset ?? 0);
}

/** An event's box in the components' { x, y, w, h } form (down/mark box, or a scroll container). */
export function refBox(take, ref) {
  // a list of refs frames their union (e.g. four control groups as one pane)
  if (Array.isArray(ref)) {
    const bs = ref.map((r) => refBox(take, r));
    const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
    return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
  }
  // an explicit box in capture px
  if (typeof ref === "object") return { x: ref.x, y: ref.y, w: ref.w ?? ref.width, h: ref.h ?? ref.height };
  const ev = findRef(take, ref);
  const b = ev.box ?? ev.container?.box;
  if (!b) throw new Error(`event "${ref}" has no box`);
  return { x: b.x, y: b.y, w: b.width ?? b.w, h: b.height ?? b.h };
}

/**
 * buildMapping(take, ranges, { grid, excise, warn }) -> { ranges, duration, map, inverse, contiguous, excised }
 * ranges: [{ from: anchor, to: anchor, timelapse?: { duration, label? } }] in story order, each
 * starting where the last ended in film time (scene-local, from 0).
 * excise: [{ from: anchor, to: anchor, note? }] source spans to drop from inside kept ranges (capture
 *   stalls). Snapped outward to the grid; the footage and every overlay close up across them. An
 *   excise that overlaps a pointer move or a click (down..up) is an error.
 * Every bound is snapped to `grid` fps (the grid shared by film, clip and source).
 *   film = filmIn + (source - srcIn) / rate,   rate = (srcOut - srcIn) / filmDur
 * map(source) returns scene-local film seconds; a time inside an excised span maps to the first
 * frame after it; a time in footage that was never kept returns null.
 */
export function buildMapping(take, ranges, { grid, excise = [], warn = () => {} }) {
  // Never use footage outside the take's keep span (the sync flashes): bounds snap inward to it.
  const lo = take.keep ? Math.ceil(take.keep.from * grid - 1e-6) / grid : -Infinity;
  const hi = take.keep ? Math.floor(take.keep.to * grid + 1e-6) / grid : Infinity;
  const kept = ranges.map((r, i) => {
    let srcIn = snapTo(anchorTime(take, r.from), grid);
    let srcOut = snapTo(anchorTime(take, r.to), grid);
    if (srcIn < lo) { if (lo - srcIn > 1.5 / grid) warn(`range ${i}: starts ${(lo - srcIn).toFixed(3)} s before sync.keep.from; clamped`); srcIn = lo; }
    if (srcOut > hi) { if (srcOut - hi > 1.5 / grid) warn(`range ${i}: ends ${(srcOut - hi).toFixed(3)} s after sync.keep.to; clamped`); srcOut = hi; }
    if (!(srcOut > srcIn)) throw new Error(`range ${i}: source out ${srcOut} is not after in ${srcIn}`);
    // timelapse: compressed and tagged; stretch: a still moment held longer (pointer at rest), untagged
    const filmDur = r.timelapse ? snapTo(r.timelapse.duration, grid) : r.stretch ? snapTo(r.stretch.duration, grid) : srcOut - srcIn;
    if (!(filmDur > 0)) throw new Error(`range ${i}: film duration must be > 0`);
    return { i, srcIn, srcOut, rate: (srcOut - srcIn) / filmDur, timelapse: r.timelapse ? { label: r.timelapse.label ?? "Time-lapse", ...r.timelapse } : null };
  });

  // excised spans, snapped outward (a stall's partial frames go too), checked against the pointer
  const cuts = excise.map((x, j) => {
    const a = Math.floor(anchorTime(take, x.from) * grid + 1e-6) / grid;
    const b = Math.ceil(anchorTime(take, x.to) * grid - 1e-6) / grid;
    if (!(b > a)) throw new Error(`excise ${j}: to must be after from`);
    for (const e of take.events) {
      const span = e.type === "move" ? [e.t, e.tEnd] : e.type === "down" ? [e.t, take.events.find((u) => u.type === "up" && u.t >= e.t)?.t ?? e.t] : null;
      if (span && span[0] < b && span[1] > a)
        throw new Error(`excise ${j} (${a.toFixed(3)}-${b.toFixed(3)} s${x.note ? `, ${x.note}` : ""}) overlaps ${e.type === "move" ? "pointer move" : "click"} "${e.label}" (${span[0].toFixed(3)}-${span[1].toFixed(3)} s); excise only while the pointer is at rest`);
    }
    if (!kept.some((k) => a < k.srcOut && b > k.srcIn)) warn(`excise ${j} (${a.toFixed(3)}-${b.toFixed(3)} s) is outside the kept ranges; ignored`);
    return { from: a, to: b, note: x.note };
  }).sort((p, q) => p.from - q.from);

  // split each kept range around the excised spans; pieces keep their range's rate
  let filmIn = 0;
  const out = [];
  const gaps = [];
  for (const k of kept) {
    let cursor = k.srcIn;
    const pieces = [];
    for (const c of cuts) {
      if (c.to <= cursor || c.from >= k.srcOut) continue;
      if (c.from > cursor) pieces.push([cursor, c.from]);
      gaps.push({ from: Math.max(c.from, k.srcIn), to: Math.min(c.to, k.srcOut) });
      cursor = Math.max(cursor, c.to);
    }
    if (cursor < k.srcOut) pieces.push([cursor, k.srcOut]);
    for (const [pIn, pOut] of pieces) {
      const filmDur = k.rate === 1 ? pOut - pIn : snapTo((pOut - pIn) / k.rate, grid);
      if (!(filmDur > 0)) continue;
      out.push({ srcIn: pIn, srcOut: pOut, filmIn, filmDur, rate: (pOut - pIn) / filmDur, timelapse: k.timelapse, range: k.i });
      filmIn = snapTo(filmIn + filmDur, grid);
    }
  }
  const duration = filmIn;
  const map = (src) => {
    for (const s of out) if (src >= s.srcIn - 1e-9 && src <= s.srcOut + 1e-9) return s.filmIn + (src - s.srcIn) / s.rate;
    for (const g of gaps) if (src > g.from && src < g.to) return map(g.to); // close up across an excise
    return null;
  };
  const inverse = (film) => {
    for (const s of out) if (film >= s.filmIn - 1e-9 && film <= s.filmIn + s.filmDur + 1e-9) return s.srcIn + (film - s.filmIn) * s.rate;
    return null;
  };
  /** True when [a, b] in source time lies inside kept footage with no cut or excise in between. */
  const contiguous = (a, b) => {
    const ia = out.findIndex((s) => a >= s.srcIn - 1e-9 && a <= s.srcOut + 1e-9);
    const ib = out.findIndex((s) => b >= s.srcIn - 1e-9 && b <= s.srcOut + 1e-9);
    if (ia < 0 || ib < 0 || ib < ia) return false;
    for (let k = ia; k < ib; k++) if (Math.abs(out[k].srcOut - out[k + 1].srcIn) > 1e-6) return false;
    return true;
  };
  return { ranges: out, duration, map, inverse, contiguous, excised: gaps };
}

/** Event types that mean something on screen is moving or about to change (rest spans avoid them). */
export const BUSY_EVENTS = Object.freeze(["move", "down", "up", "key", "type", "scroll", "mark", "sync"]);

/**
 * restSpans(take, from, to) -> [{ from, to, length, quiet }] in source seconds, longest first.
 * The spans inside [from, to] with the pointer at rest and nothing logged: no move, click, key,
 * typing, scroll, mark or sync flash (an event with tEnd covers t..tEnd), and not inside an agent
 * wait (waitStart..waitEnd: the UI is loading). A wait that ended "quiet" (take.waitQuiet: no DOM
 * mutation for its last `quietMs`, 800 ms by default) gives that tail back as rest, marked
 * quiet: true (the recorder saw no UI change there). Ties in length go to the quiet span.
 */
export function restSpans(take, from, to) {
  const busy = [];
  const evs = take.events ?? [];
  for (const e of evs) if (BUSY_EVENTS.includes(e.type)) busy.push([e.t, e.tEnd ?? e.t]);
  const quiet = [];
  for (const ws of evs.filter((e) => e.type === "waitStart")) {
    const we = evs.find((e) => e.type === "waitEnd" && e.label === ws.label && e.t >= ws.t);
    const end = we?.t ?? Infinity;
    const tail = we?.outcome === "quiet" ? Math.min(end - ws.t, (we.quietMs ?? 800) / 1000) : 0;
    busy.push([ws.t, end - tail]);
    if (tail > 0) quiet.push([end - tail, end]);
    busy.push([end, end]);
  }
  busy.sort((a, b) => a[0] - b[0]);
  const out = [];
  let cursor = from;
  const push = (a, b) => {
    if (b - a <= 1e-9) return;
    const q = quiet.some(([qa, qb]) => qa <= a + 1e-6 && qb >= b - 1e-6);
    out.push({ from: a, to: b, length: b - a, quiet: q });
  };
  for (const [a, b] of busy) {
    if (b < cursor) continue;
    if (a >= to) break;
    push(cursor, Math.min(a, to));
    cursor = Math.max(cursor, b);
  }
  if (cursor < to) push(cursor, to);
  return out.sort((p, q) => q.length - p.length || Number(q.quiet) - Number(p.quiet));
}
