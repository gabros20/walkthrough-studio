// The camera: scale/x/y on the stage wrapper (#<stage>-cam, transform origin 0 0, canvas px).
// A canvas point P is drawn at  scale * P + (x, y).

import { CAMERA, FILM, K, WINDOW } from "./config.mjs";
import { Timeline } from "./emit.mjs";

export const WIDE = Object.freeze({ scale: 1, x: 0, y: 0 });

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Capture-px box {x,y,w,h} -> canvas px at wide framing. */
export function boxToCanvas(b) {
  return { x: WINDOW.left + b.x * K, y: WINDOW.top + b.y * K, w: b.w * K, h: b.h * K };
}

/**
 * framing(box, kind, opts) -> { scale, x, y }
 * box in capture CSS px (the recorder's logged element box). kind: "wide" | "pane" | "control".
 * The box is centred on CAMERA.focus (the middle of the area above the caption band), at the
 * largest scale that keeps it inside `fill` of the canvas, clamped to the kind's scale range,
 * then the view is clamped so the window covers the canvas above the caption band (y 0-900).
 * opts.scale forces a scale; opts.focus overrides the focus point.
 */
export function framing(box, kind = "control", opts = {}) {
  if (kind === "wide" || !box) return { ...WIDE };
  const [lo, hi] = kind === "pane" ? CAMERA.paneScale : CAMERA.controlScale;
  const fill = CAMERA.fill[kind] ?? 0.6;
  const c = boxToCanvas(box);
  const fit = Math.min((FILM.width * fill) / c.w, (FILM.height * fill) / c.h);
  const scale = opts.scale ?? clamp(fit, lo, hi);
  const focus = opts.focus ?? CAMERA.focus;
  let x = focus.x - scale * (c.x + c.w / 2);
  let y = focus.y - scale * (c.y + c.h / 2);
  // Keep the window covering the canvas across its full width and from the top down to the
  // caption band (y 900): zoomed, the screen fills the frame and the band below stays ink, so a
  // caption never covers what the camera framed.
  const wl = WINDOW.left * scale, wr = (WINDOW.left + WINDOW.width) * scale;
  const wt = WINDOW.top * scale, wb = (WINDOW.top + WINDOW.height) * scale;
  const band = WINDOW.top + WINDOW.height; // 900
  if (wr - wl >= FILM.width) x = clamp(x, FILM.width - wr, -wl);
  if (wb - wt >= band) y = clamp(y, band - wb, -wt);
  return { scale, x, y };
}

/**
 * cameraMove({ stage, from, to, at, dur, ease }) -> Timeline. One tween, power2.inOut by default.
 */
export function cameraMove({ stage, from, to, at, dur = CAMERA.moveSeconds, ease = CAMERA.ease }) {
  return new Timeline().fromTo(
    `#${stage}-cam`,
    { scale: from.scale, x: from.x, y: from.y, transformOrigin: "0 0" },
    { scale: to.scale, x: to.x, y: to.y, duration: dur, ease, transformOrigin: "0 0" },
    at,
  );
}

/**
 * Camera: keeps the current framing so moves chain without jumps.
 *   const cam = new Camera({ stage: "a" });
 *   cam.frame({ box, kind: "pane", at: 3.2 });   // "frame this box" is one call
 *   cam.wide({ at: 6 });
 *   const cut = cam.pushThrough({ box, at: 8 });  // returns the time to cut to the next scene
 *   cam.settleIn({ at: 0 });                       // the incoming scene arrives slightly large
 *   cam.whipOut({ at, dir }), cam.whipIn({ at, dir })
 */
/** True when a framing puts the window's bottom edge well into the caption band. */
export const bandNeeded = (st) => (WINDOW.top + WINDOW.height) * st.scale + st.y > WINDOW.top + WINDOW.height + 30;

export class Camera {
  constructor({ stage, start = WIDE }) {
    this.stage = stage;
    this.state = { ...start };
    this.bandOn = bandNeeded(start);
    this.tl = new Timeline();
    this.tl.set(`#${stage}-cam`, { ...start, transformOrigin: "0 0" }, 0);
  }
  to({ state, at, dur = CAMERA.moveSeconds, ease }) {
    // moves never overlap: one that would start before the last one lands waits for it
    const start = Math.max(at, this.until ?? 0);
    this.tl.add(cameraMove({ stage: this.stage, from: this.state, to: state, at: start, dur, ease }));
    // The caption band: zoomed, the window would run down into it; an ink band (#<stage>-band)
    // covers y 900-1080 whenever the framed window reaches past y 930, fading with the move.
    const need = bandNeeded(state);
    if (need !== this.bandOn) {
      this.tl.fromTo(`#${this.stage}-band`, { opacity: need ? 0 : 1 }, { opacity: need ? 1 : 0, duration: dur, ease: ease ?? CAMERA.ease }, start);
      this.bandOn = need;
    }
    this.state = { ...state };
    this.until = start + dur;
    return this;
  }
  frame({ box, kind = "control", at, dur, scale, focus }) {
    return this.to({ state: framing(box, kind, { scale, focus }), at, dur });
  }
  wide({ at, dur }) {
    return this.to({ state: WIDE, at, dur });
  }
  /**
   * Camera push through a clicked control: track to it at control framing (0.5 s, power2.inOut),
   * then zoom through it until it is ~250% of the frame wide (0.35 s, power3.in). Returns the cut time.
   * hide: selectors faded out as the zoom starts (pass the pointer's "#<id>-arc").
   */
  pushThrough({ box, at, track = 0.5, through = 0.35, hide = [] }) {
    const f = framing(box, "control");
    this.to({ state: f, at, dur: track });
    const c = boxToCanvas(box);
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    // Through: the control grows to ~250% of the frame width while its centre travels to the
    // frame's focus point, so its fill becomes the frame.
    const s = Math.min(40, Math.max(f.scale * 4, (2.5 * FILM.width) / c.w));
    this.to({ state: { scale: s, x: CAMERA.focus.x - s * cx, y: CAMERA.focus.y - s * cy }, at: at + track, dur: through, ease: "power3.in" });
    // Overlay elements that should not balloon with the zoom (the pointer) leave first.
    for (const sel of hide)
      this.tl.fromTo(sel, { opacity: 1 }, { opacity: 0, duration: 0.12, ease: "power3.in" }, at + track);
    return at + track + through;
  }
  /** The scene after a push arrives 6% large and settles (expo.out). */
  settleIn({ at = 0, dur = 0.6, from = 1.06 }) {
    const s = { scale: from, x: (FILM.width * (1 - from)) / 2, y: (FILM.height * (1 - from)) / 2 };
    this.state = s;
    this.tl.set(`#${this.stage}-cam`, { ...s, transformOrigin: "0 0" }, 0);
    return this.to({ state: WIDE, at, dur, ease: "expo.out" });
  }
  /**
   * Whip (0.32 s in all): the stage leaves in 0.12 s on a strong ease-in and the next one arrives in
   * 0.2 s on expo.out from 1100 px, already overlapping the frame on its first frame. No blur: the
   * render-time motion blur showed no smear here, so the speed itself has to read.
   */
  whipOut({ at, dir = -1, dur = 0.12 }) {
    return this.to({ state: { ...this.state, x: this.state.x + dir * 1600 }, at, dur, ease: "power4.in" });
  }
  whipIn({ at, dir = -1, dur = 0.2, state = WIDE, from = 1100 }) {
    // Enters already overlapping the frame on its first frame, so the cut never shows empty ground.
    this.state = { ...state, x: state.x - dir * from };
    // a set at the same instant guarantees the first frame of the move already shows the
    // incoming offset (a fromTo is not drawn at exactly its start when the prior state differs)
    this.tl.set(`#${this.stage}-cam`, { ...this.state, transformOrigin: "0 0" }, at);
    return this.to({ state, at, dur, ease: "expo.out" });
  }
  part() {
    return { css: "", html: "", tl: this.tl };
  }
}
