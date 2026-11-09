// The drawn pointer. Lives inside the stage overlay (window-local stage px), so it moves and
// scales with the camera: 44 px tall at wide framing, ~75 px at a 1.7x punch-in.
//
// Element tree (ids prefixed by the pointer id):
//   #<id>        chord position  (x, y tweened along the straight line, recorder ease)
//   #<id>-arc    sideways bulge  (x, y offset; together they trace the quadratic arc exactly)
//   #<id>-press  press scale     (transform origin = the hotspot)
//   #<id>-arrow / -hand / -ibeam  the three shapes, one visible at a time
// Click discs are siblings placed under the pointer: #<id>-disc-<n>.

import { MOTION, controlPoint, moveDuration } from "../../recorder/motion.mjs";
import { K, POINTER } from "./config.mjs";
import { n, raw, Timeline } from "./emit.mjs";

const SIZE = POINTER.size; // stage px at wide framing (44 = 4% of 1080)
const UNIT = SIZE / 28.5; // shape units -> px (the arrow is 28.5 units tall incl. edge)

// Shapes in units, hotspot at (0,0). Black fill, white edge (stroke painted under the fill).
const SHAPES = {
  arrow: {
    d: "M0,0 L0,24.2 L5.7,18.9 L9.5,27.6 L13.2,26 L9.5,17.5 L17.2,17.3 Z",
    box: [-1.5, -1.5, 20.5, 31],
  },
  hand: {
    // index finger up; hotspot at the fingertip
    d: "M0,0.2 C1.5,0.2 2.5,1.2 2.5,2.7 L2.5,9.6 C2.5,8.4 3.5,7.6 4.7,7.6 C5.9,7.6 6.9,8.4 6.9,9.6 L6.9,10.6 C6.9,9.5 7.9,8.8 9,8.8 C10.2,8.8 11.1,9.6 11.1,10.8 L11.1,11.8 C11.1,10.8 12,10.2 13,10.2 C14.1,10.2 15,11 15,12.2 L15,18.2 C15,23.2 12,27.2 7,27.2 L4,27.2 C1,27.2 -0.9,26 -2.5,23.8 L-7.3,17 C-8.1,15.9 -7.9,14.5 -6.9,13.8 C-5.9,13.1 -4.5,13.3 -3.7,14.3 L-2.5,15.8 L-2.5,2.7 C-2.5,1.3 -1.5,0.2 0,0.2 Z",
    lines: "M2.5,10.6 L2.5,16.4 M6.9,11.4 L6.9,16.4 M11.1,12.4 L11.1,16.4",
    box: [-9.5, -1.5, 26.5, 30.5],
  },
  ibeam: {
    d: "M-4.5,-12 L-1.6,-12 C-0.9,-12 -0.3,-11.7 0,-11.3 C0.3,-11.7 0.9,-12 1.6,-12 L4.5,-12 L4.5,-10 L2,-10 C1.4,-10 1,-9.6 1,-9 L1,9 C1,9.6 1.4,10 2,10 L4.5,10 L4.5,12 L1.6,12 C0.9,12 0.3,11.7 0,11.3 C-0.3,11.7 -0.9,12 -1.6,12 L-4.5,12 L-4.5,10 L-2,10 C-1.4,10 -1,9.6 -1,9 L-1,-9 C-1,-9.6 -1.4,-10 -2,-10 L-4.5,-10 Z",
    box: [-6.5, -14, 13, 28],
  },
};

function shapeSvg(id, name, visible) {
  const s = SHAPES[name];
  const [bx, by, bw, bh] = s.box;
  const extra = s.lines
    ? `<path d="${s.lines}" fill="none" stroke="${POINTER.edge}" stroke-width="0.9" stroke-linecap="round"/>`
    : "";
  return `<svg id="${id}-${name}" class="ptr-shape" viewBox="${bx} ${by} ${bw} ${bh}" style="left:${n(bx * UNIT)}px; top:${n(by * UNIT)}px; width:${n(bw * UNIT)}px; height:${n(bh * UNIT)}px; opacity:${visible ? 1 : 0}"><path d="${s.d}" fill="${POINTER.fill}" stroke="${POINTER.edge}" stroke-width="2" stroke-linejoin="round" paint-order="stroke"/>${extra}</svg>`;
}

/** Capture px -> stage px. */
export const toStage = (p) => ({ x: p.x * K, y: p.y * K });

/**
 * pointerMarkup({ id, shape }) -> { css, html }. Starts hidden; show it with pointerShow.
 */
export function pointerMarkup({ id = "ptr", shape = "arrow" }) {
  const css = `
    #${id} { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 30; opacity: 0; }
    #${id}-arc, #${id}-press { position: absolute; left: 0; top: 0; width: 0; height: 0; }
    #${id} .ptr-shape { position: absolute; overflow: visible; filter: drop-shadow(0 2px 3px rgba(0,0,0,.32)); }
    .${id}-disc { position: absolute; width: 64px; height: 64px; margin: -32px 0 0 -32px; z-index: 29; }
    .${id}-disc > div { width: 64px; height: 64px; border-radius: 50%; background: ${POINTER.disc}; opacity: 0; }`;
  const html = `
        <div id="${id}"><div id="${id}-arc"><div id="${id}-press">
          ${shapeSvg(id, "arrow", shape === "arrow")}
          ${shapeSvg(id, "hand", shape === "hand")}
          ${shapeSvg(id, "ibeam", shape === "ibeam")}
        </div></div></div>`;
  return { css, html };
}

/**
 * pointerMove({ id, from, to, start, end, control }) -> Timeline
 * from/to/control in capture px (as logged); start/end in scene seconds (already mapped to film time).
 * control defaults to the recorder's controlPoint(from, to); end defaults to start + moveDuration.
 * Reproduces bezier(from, control, to, HF.p3(progress)) exactly: chord + bulge.
 */
export function pointerMove({ id = "ptr", from, to, start, end, control }) {
  const c = control ?? controlPoint(from, to);
  const dur = (end ?? start + moveDuration(from, to)) - start;
  const A = toStage(from);
  const B = toStage(to);
  const C = toStage(c);
  const D = { x: C.x - (A.x + B.x) / 2, y: C.y - (A.y + B.y) / 2 };
  const tl = new Timeline();
  tl.fromTo(`#${id}`, { x: A.x, y: A.y }, { x: B.x, y: B.y, duration: dur, ease: raw("HF.p3") }, start);
  const half = dur / 2;
  tl.fromTo(`#${id}-arc`, { x: 0, y: 0 }, { x: D.x / 2, y: D.y / 2, duration: half, ease: raw("HF.arcA") }, start);
  tl.fromTo(`#${id}-arc`, { x: D.x / 2, y: D.y / 2 }, { x: 0, y: 0, duration: half, ease: raw("HF.arcB") }, start + half);
  return tl;
}

/** pointerPlace({ id, at, point }) -> Timeline: put the pointer at a point without a move. */
export function pointerPlace({ id = "ptr", at, point }) {
  const p = toStage(point);
  return new Timeline().set(`#${id}`, { x: p.x, y: p.y }, at).set(`#${id}-arc`, { x: 0, y: 0 }, at);
}

/** pointerShow / pointerHide: instant flips of the whole pointer. */
export const pointerShow = ({ id = "ptr", at }) => new Timeline().set(`#${id}`, { opacity: 1 }, at);
export const pointerHide = ({ id = "ptr", at }) => new Timeline().set(`#${id}`, { opacity: 0 }, at);

/** pointerShape({ id, at, shape }) -> Timeline. shape: "arrow" | "hand" | "ibeam". */
export function pointerShape({ id = "ptr", at, shape }) {
  const tl = new Timeline();
  for (const s of Object.keys(SHAPES)) tl.set(`#${id}-${s}`, { opacity: s === shape ? 1 : 0 }, at);
  return tl;
}

/** Map a CSS cursor value (as the recorder logs it) to a pointer shape. */
export function shapeForCursor(cursor) {
  if (cursor === "pointer") return "hand";
  if (cursor === "text" || cursor === "vertical-text") return "ibeam";
  return "arrow";
}

/**
 * pointerClick({ id, at, point, disc }) -> { css, html, tl }
 * at = mouse-down time. Press 1 -> 0.86 -> 1 over 0.18 s; a disc (its own clip, #<id>-disc-<disc>,
 * so it cannot show outside its 0.35 s) grows 28 -> 64 px and fades 28% -> 0 under the tip.
 */
export function pointerClick({ id = "ptr", at, point, disc = 0 }) {
  const p = toStage(point);
  const did = `${id}-disc-${disc}`;
  const tl = new Timeline();
  tl.fromTo(`#${id}-press`, { scale: 1 }, { scale: 0.86, duration: 0.09, ease: "power2.out" }, at);
  tl.fromTo(`#${id}-press`, { scale: 0.86 }, { scale: 1, duration: 0.09, ease: "power2.out" }, at + 0.09);
  tl.fromTo(`#${did}-in`, { scale: 28 / 64, opacity: 0.28 }, { scale: 1, opacity: 0, duration: 0.35, ease: "power2.out" }, at);
  const html = `
        <div id="${did}" class="${id}-disc clip" data-start="${n(at)}" data-duration="0.36" style="left:${n(p.x)}px; top:${n(p.y)}px"><div id="${did}-in"></div></div>`;
  return { css: "", html, tl };
}

/**
 * Pointer: a stateful helper that keeps the current position and shape so each move's fromTo
 * starts exactly where the last one ended (no teleports). Emits one part: { css, html, tl }.
 *   const p = new Pointer({ id: "ptr", point: { x: 1500, y: 900 } });
 *   p.show(0.2); p.move({ to, start, end, control }); p.click({ at }); p.shape({ at, shape });
 */
export class Pointer {
  constructor({ id = "ptr", point, shape = "arrow" }) {
    this.id = id;
    this.pos = point;
    this.cur = shape;
    this.clicks = 0;
    this.parts = [pointerMarkup({ id, shape })];
    this.tl = new Timeline();
    this.tl.add(pointerPlace({ id, at: 0, point }));
  }
  show(at) { this.tl.add(pointerShow({ id: this.id, at })); return this; }
  hide(at) { this.tl.add(pointerHide({ id: this.id, at })); return this; }
  move({ to, start, end, control, from }) {
    this.tl.add(pointerMove({ id: this.id, from: from ?? this.pos, to, start, end, control }));
    this.pos = to;
    return this;
  }
  click({ at, point }) {
    this.parts.push(pointerClick({ id: this.id, at, point: point ?? this.pos, disc: this.clicks++ }));
    return this;
  }
  shape({ at, shape }) {
    if (shape !== this.cur) this.tl.add(pointerShape({ id: this.id, at, shape }));
    this.cur = shape;
    return this;
  }
  /** Fade the pointer out over `dur` s, ending at `end` (a cut). */
  fadeOut({ end, dur = CUT_FADE.out }) {
    this.tl.fromTo(`#${this.id}-press`, { opacity: 1 }, { opacity: 0, duration: dur, ease: "power2.in" }, end - dur);
    return this;
  }
  /**
   * Keep the pointer invisible from `cut` and fade it in `after` s later (at its current point).
   * With `hidden` (a scene's first frame) it is set invisible at `cut` explicitly.
   */
  fadeIn({ cut, after = CUT_FADE.after, dur = CUT_FADE.in, hidden = false }) {
    if (hidden) this.tl.set(`#${this.id}-press`, { opacity: 0 }, cut);
    this.tl.fromTo(`#${this.id}-press`, { opacity: 0 }, { opacity: 1, duration: dur, ease: "power2.out" }, cut + after);
    return this;
  }
  part() {
    const css = this.parts.map((p) => p.css).join("\n");
    const html = this.parts.map((p) => p.html).join("");
    const tl = new Timeline().add(this.tl);
    for (const p of this.parts) tl.add(p.tl);
    return { css, html, tl };
  }
}

// ---------- pointer continuity at cuts ----------
// Where a cut moves the drawn pointer (between scenes, between non-contiguous ranges of a scene)
// and the storyboard gives no treatment, the build applies one by distance in stage px at wide
// framing: up to jump.bridge nothing (a small hop reads as part of the cut), up to jump.fade a
// bridge (a short arc move from the old point to the new one, starting at the cut, on the
// recorder's curve and ease), beyond that a fade (out before the cut, back in at the new point just
// after it).

/** Treatment timings in seconds. A bridge capped below minSeconds by the next logged action becomes a fade. */
export const CUT_BRIDGE = Object.freeze({ seconds: 0.35, minSeconds: 0.2 });
export const CUT_FADE = Object.freeze({ out: 0.15, after: 0.2, in: 0.15 });
/** Default distance thresholds (stage px at wide framing); the storyboard's top-level "jump" overrides. */
export const JUMP = Object.freeze({ bridge: 120, fade: 400 });
export const CUT_MODES = Object.freeze(["auto", "bridge", "fade", "none"]);

/**
 * cutTreatment({ px, mode, override, jump }) -> { kind: "bridge" | "fade" | null, by: "auto" | "storyboard" }
 * mode: the storyboard's "pointerAtCuts" ("auto" by default); override: a per-cut "pointer" value
 * from a scene's exit or a range (wins over mode). An override of "bridge" or "fade" applies to any
 * visible change (> 1 px); the film-wide modes only above jump.bridge.
 */
export function cutTreatment({ px, mode = "auto", override = null, jump = JUMP }) {
  const j = { ...JUMP, ...(jump ?? {}) };
  for (const m of [mode, override]) if (m != null && !CUT_MODES.includes(m)) throw new Error(`pointer at cuts: unknown value ${JSON.stringify(m)} (want ${CUT_MODES.join(" | ")})`);
  if (override && override !== "auto") {
    if (override === "none" || !(px > 1)) return { kind: null, by: "storyboard" };
    return { kind: override, by: "storyboard" };
  }
  if (!(px > j.bridge) || mode === "none") return { kind: null, by: "auto" };
  if (mode === "bridge" || mode === "fade") return { kind: mode, by: "auto" };
  return { kind: px > j.fade ? "fade" : "bridge", by: "auto" };
}

/**
 * Bridge length for a cut at `cut` when the next logged move or click starts at `next` (Infinity
 * when none): CUT_BRIDGE.seconds, capped so it never runs into that action; null when the room left
 * is under CUT_BRIDGE.minSeconds (the caller fades instead).
 */
export function bridgeSeconds(cut, next) {
  const d = Math.min(CUT_BRIDGE.seconds, next - cut);
  return d >= CUT_BRIDGE.minSeconds - 1e-9 ? d : null;
}

export { MOTION, moveDuration, controlPoint };
