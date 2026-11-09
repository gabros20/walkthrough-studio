// Pointer path maths shared by the recorder (which drives the real, invisible mouse) and the editor
// (which draws the pointer). Pure functions, no dependencies: the editing step may import this file
// directly so the drawn pointer follows exactly the curve the mouse followed during the take.

export const MOTION = Object.freeze({
  bend: 0.08, // control point offset, as a fraction of the straight-line distance
  baseSeconds: 0.35, // duration = clamp(base + distance / pxPerSecond, min, max)
  pxPerSecond: 2400,
  minSeconds: 0.4,
  maxSeconds: 0.9,
  clickLead: 0.18, // the pointer arrives this long before the press
  pressSeconds: 0.09, // mouse down -> mouse up
  ease: "power3.inOut",
});

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Move duration in seconds for a straight-line distance in CSS px. */
export function moveDuration(from, to) {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  return clamp(
    MOTION.baseSeconds + d / MOTION.pxPerSecond,
    MOTION.minSeconds,
    MOTION.maxSeconds,
  );
}

/**
 * Control point of the quadratic arc: the chord midpoint pushed sideways by 8% of the distance.
 * The arc always bows upward (towards smaller y); a perfectly vertical move bows to the right.
 */
export function controlPoint(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  if (d < 1e-9) return mid;
  let nx = -dy / d;
  let ny = dx / d;
  if (ny > 1e-9 || (Math.abs(ny) <= 1e-9 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { x: mid.x + nx * d * MOTION.bend, y: mid.y + ny * d * MOTION.bend };
}

/** GSAP power3.inOut (quartic: GSAP's powerN is degree N+1). */
export function power3InOut(p) {
  return p < 0.5 ? 8 * p * p * p * p : 1 - (-2 * p + 2) ** 4 / 2;
}

/** Quadratic bezier at parameter u in [0,1]. */
export function bezier(from, control, to, u) {
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const c = u * u;
  return {
    x: a * from.x + b * control.x + c * to.x,
    y: a * from.y + b * control.y + c * to.y,
  };
}

/**
 * Pointer position of a logged move segment at time t (same clock as the segment's t / tEnd).
 * The eased progress is used directly as the bezier parameter (not arc length).
 */
export function positionOnMove(move, t) {
  const span = move.tEnd - move.t;
  const p = span > 0 ? clamp((t - move.t) / span, 0, 1) : 1;
  return bezier(move.from, move.control, move.to, power3InOut(p));
}

/**
 * Pointer position at time t from a whole events list: on a move's curve while it runs, otherwise
 * resting at the end of the latest move (or at `start` before the first move).
 */
export function pointerAt(events, t, start) {
  let pos = start;
  for (const e of events) {
    if (e.type !== "move") continue;
    if (t < e.t) break;
    pos = t >= e.tEnd ? e.to : positionOnMove(e, t);
  }
  return pos;
}
