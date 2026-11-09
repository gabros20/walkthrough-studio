// Scene-level transitions. Four kinds, each caused by something on screen:
//   1. accent slant wipe slantWipe()          title and end card (a part merged into a scene)
//   2. camera push      Camera.pushThrough() through the clicked control, then Camera.settleIn()
//   3. whip             Camera.whipOut()/whipIn() in the format montage (motion blur does the smear)
//   4. hard cut         two scene hosts back to back (no code: the seam is the cut)

import { COLOR, FILM, SHAPE } from "./config.mjs";
import { n, Timeline } from "./emit.mjs";

const SLANT = SHAPE.wipeSlantDeg; // degrees, the lean of the panel ("/"); brand shape.wipeSlantDeg
const TAN = Math.tan((SLANT * Math.PI) / 180);

/**
 * slantWipe({ id, start, dur, dir, width }) -> { css, html, tl, cut }
 * An accent-colour panel leaning "/" crosses the frame, led by a thin bar.
 * dir: 1 = left to right, -1 = right to left. The frame is fully red around `cut` (the travel
 * midpoint) for about 0.1 s; cut the scenes underneath there. power2.inOut, one tween.
 */
export function slantWipe({ id = "wipe", start, dur = 0.9, dir = 1, width = 3400 }) {
  const H = FILM.height, W = FILM.width;
  const lean = (TAN * H) / 2; // horizontal offset of the top/bottom corners from the centre line
  const bar = 64, gap = 44;
  const total = width + gap + bar;
  // Group x (left edge of the panel box, before skew). Off-left: right-most point < 0.
  const offLeft = -(total + lean + 8);
  const offRight = W + lean + 8;
  const x0 = dir > 0 ? offLeft : offRight;
  const x1 = dir > 0 ? offRight : offLeft;
  const barLeft = dir > 0 ? width + gap : 0;
  const panelLeft = dir > 0 ? 0 : bar + gap;
  const css = `
    #${id} { position: absolute; inset: 0; z-index: 90; pointer-events: none; overflow: hidden; }
    #${id}-g { position: absolute; left: 0; top: 0; width: ${total}px; height: ${H}px; }
    #${id}-g > div { position: absolute; top: 0; height: ${H}px; background: ${COLOR.accent}; transform: skewX(-${SLANT}deg); }`;
  const html = `    <div id="${id}" class="clip" data-start="${n(start)}" data-duration="${n(dur + 1 / FILM.fps)}" data-layout-ignore>
      <div id="${id}-g">
        <div style="left:${panelLeft}px; width:${width}px"></div>
        <div style="left:${barLeft}px; width:${bar}px"></div>
      </div>
    </div>`;
  const tl = new Timeline().fromTo(`#${id}-g`, { x: x0 }, { x: x1, duration: dur, ease: "power2.inOut" }, start);
  return { css, html, tl, cut: start + dur / 2 };
}
