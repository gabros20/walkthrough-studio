// The on-screen time-lapse tag: shown for exactly the film span of a compressed range, so a
// sped-up agent wait is always labelled. Lives in the ink band at the window's left edge, outside
// the camera (it never moves with the screen), aligned with the caption plate's centre line.

import { CAPTION, COLOR, FILM, TYPE, WINDOW } from "./config.mjs";
import { esc, n, Timeline } from "./emit.mjs";

/**
 * timelapseTag({ id, start, end, label, rate, x }) -> part   (x: left edge, default the window's)
 * "Time-lapse  12x" in the brand font (look.type.tag, 28 px / 500), muted paper, with a two-chevron fast-forward mark.
 * In: 0.2 s blur-in; out: 0.15 s fade before end; hard-hidden outside its clip.
 */
export function timelapseTag({ id, start, end, label = "Time-lapse", rate, x = WINDOW.left }) {
  const speed = rate && rate > 1.05 ? `${Math.round(rate)}×` : "";
  const cy = CAPTION.top + CAPTION.height / 2;
  const css = `
    #${id} { position: absolute; left: ${n(x)}px; top: ${n(cy - 22)}px; height: 44px; display: flex; align-items: center; gap: 14px; z-index: 60; font-family: ${FILM.fontStack}; font-size: ${TYPE.tag.size}px; font-weight: ${TYPE.tag.weight}; letter-spacing: 0; color: ${COLOR.muted}; white-space: nowrap; }
    #${id} svg { width: 30px; height: 22px; display: block; }
    #${id} .spd { color: ${COLOR.white}; font-weight: 700; }`;
  const html = `    <div id="${id}" class="clip" data-start="${n(start)}" data-duration="${n(end - start)}" data-layout-allow-caption-zone>
      <div id="${id}-in" style="display:flex; align-items:center; gap:14px">
        <svg viewBox="0 0 30 22"><path d="M2 2 L13 11 L2 20 Z M15 2 L26 11 L15 20 Z" fill="${COLOR.muted}"/></svg>
        <span>${esc(label)}</span>${speed ? `<span class="spd">${speed}</span>` : ""}
      </div>
    </div>`;
  const tl = new Timeline();
  tl.fromTo(`#${id}-in`, { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.2, ease: "expo.out" }, start);
  if (end - start > 0.6) tl.fromTo(`#${id}-in`, { opacity: 1 }, { opacity: 0, duration: 0.15, ease: "power3.in" }, end - 0.15);
  return { css, html, tl };
}

/** Conservative widths: caption text ~CAPTION.charWidth px a character (21.5 at 44 px Roboto Bold), plus padding; the tag ~250 px. */
export const TAG_WIDTH = 250;
export const plateWidth = (text) => text.length * CAPTION.charWidth + 102;
