// Spotlight: pointing without clicking. Everything else in the window dims (ink, 25%) and a 3 px rounded
// outline traces the element's logged box, for a given span. Sits in the stage overlay, so it
// moves with the camera. Its own clip, so it can never show outside [start, end).

import { COLOR, K, WINDOW } from "./config.mjs";
import { n, Timeline } from "./emit.mjs";

/**
 * spotlight({ id, box, start, end, pad, radius, dim, color }) -> { css, html, tl }
 * box in capture px. pad/radius in capture px around the box. The window outside dims with ink at
 * 25% (0.25 s in, power2.inOut) while the outline traces clockwise from the top-left in 0.55 s;
 * both fade out over the last 0.27 s.
 */
export function spotlight({ id, box, start, end, pad = 8, radius = 10, dim = 0.25, color = COLOR.ink, stroke = 3 }) {
  const W = WINDOW.width, H = WINDOW.height;
  const x = (box.x - pad) * K, y = (box.y - pad) * K;
  const w = (box.w + 2 * pad) * K, h = (box.h + 2 * pad) * K;
  const r = radius * K;
  // Full window minus the rounded box (even-odd).
  const hole = `M${n(x + r)},${n(y)} H${n(x + w - r)} A${n(r)},${n(r)} 0 0 1 ${n(x + w)},${n(y + r)} V${n(y + h - r)} A${n(r)},${n(r)} 0 0 1 ${n(x + w - r)},${n(y + h)} H${n(x + r)} A${n(r)},${n(r)} 0 0 1 ${n(x)},${n(y + h - r)} V${n(y + r)} A${n(r)},${n(r)} 0 0 1 ${n(x + r)},${n(y)} Z`;
  const dimPath = `M0,0 H${W} V${H} H0 Z ${hole}`;
  const dur = end - start;
  const css = `
    #${id} { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; z-index: 20; pointer-events: none; }
    #${id} svg { position: absolute; left: 0; top: 0; width: ${W}px; height: ${H}px; overflow: visible; }`;
  const html = `
        <div id="${id}" class="clip" data-start="${n(start)}" data-duration="${n(dur)}" data-layout-ignore>
          <svg viewBox="0 0 ${W} ${H}">
            <path id="${id}-dim" d="${dimPath}" fill="${COLOR.ink}" fill-rule="evenodd" opacity="0"/>
            <path id="${id}-line" d="${hole}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/>
          </svg>
        </div>`;
  const tl = new Timeline();
  tl.fromTo(`#${id}-dim`, { opacity: 0 }, { opacity: dim, duration: 0.25, ease: "power2.inOut" }, start);
  tl.fromTo(`#${id}-line`, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.55, ease: "power2.inOut" }, start + 0.05);
  const out = Math.max(start + 0.6, end - 0.27);
  tl.fromTo(`#${id}-dim`, { opacity: dim }, { opacity: 0, duration: 0.25, ease: "power2.inOut" }, out);
  tl.fromTo(`#${id}-line`, { opacity: 1 }, { opacity: 0, duration: 0.25, ease: "power2.inOut" }, out);
  return { css, html, tl };
}
