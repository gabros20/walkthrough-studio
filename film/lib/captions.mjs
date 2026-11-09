// Captions: one line at a time on a slanted ink plate (the brand's button lean) with an accent tick,
// bottom centre in the band under the window. One composition holds every caption (one captions
// track); each caption is its own clip, so it is hard-hidden outside [start, end).

import { CAPTION, COLOR, FILM } from "./config.mjs";
import { esc, n, sceneFile, Timeline } from "./emit.mjs";

export const VARIANTS = ["wipe", "words", "tick"];

/** Minimum hold for a caption: 0.5 s + 0.3 s a word (the last line of the film: 2.5 s). */
export const captionHold = (text, last = false) => Math.max(last ? 2.5 : 0, 0.5 + 0.3 * text.trim().split(/\s+/).length);

/** Problems with a caption list, as strings (empty = fine). */
export function lintCaptions(items) {
  const out = [];
  items.forEach((c, i) => {
    const words = c.text.trim().split(/\s+/).length;
    if (words > CAPTION.maxWords) out.push(`caption ${i}: ${words} words (max ${CAPTION.maxWords})`);
    const need = captionHold(c.text, i === items.length - 1 && c.last);
    if (c.end - c.start < need - 1e-6) out.push(`caption ${i}: holds ${(c.end - c.start).toFixed(2)} s, needs ${need.toFixed(2)} s`);
    if (i > 0 && c.start < items[i - 1].end) out.push(`caption ${i}: overlaps caption ${i - 1}`);
  });
  return out;
}

const css = `
    .cap { position: absolute; inset: 0; pointer-events: none; }
    .cap-row { position: absolute; left: 0; right: 0; top: ${CAPTION.top}px; height: ${CAPTION.height}px; display: flex; justify-content: center; }
    .cap-plate { position: relative; height: ${CAPTION.height}px; display: flex; align-items: center; padding: 0 38px 0 64px; }
    .cap-bgw { position: absolute; inset: 0; transform-origin: 0% 50%; }
    .cap-bg { position: absolute; inset: 0; background: ${CAPTION.plate}; transform: skewX(${CAPTION.slantDeg}deg); border-radius: 3px; }
    .cap-tickw { position: absolute; left: 26px; top: 16px; width: 10px; height: 32px; transform-origin: 50% 100%; }
    .cap-tick { position: absolute; inset: 0; background: ${COLOR.accent}; transform: skewX(${CAPTION.slantDeg}deg); }
    .cap-text { position: relative; font-family: ${FILM.fontStack}; font-size: ${CAPTION.size}px; font-weight: ${CAPTION.weight}; line-height: 1; letter-spacing: -0.005em; color: ${COLOR.white}; white-space: nowrap; }
    .cap-text .w { display: inline-block; }`;

function group(c, i) {
  const id = `cap-${i}`;
  const words = c.text.trim().split(/\s+/);
  const spans = words.map((w, j) => `<span class="w" id="${id}-w${j}">${esc(w)}</span>`).join(" ");
  return `    <div id="${id}" class="cap clip" data-start="${n(c.start)}" data-duration="${n(c.end - c.start)}" data-layout-allow-caption-zone>
      <div class="cap-row">
        <div id="${id}-plate" class="cap-plate">
          <div id="${id}-bgw" class="cap-bgw"><div class="cap-bg"></div></div>
          <div id="${id}-tickw" class="cap-tickw"><div class="cap-tick"></div></div>
          <div id="${id}-text" class="cap-text">${spans}</div>
        </div>
      </div>
    </div>`;
}

function enter(tl, c, i) {
  const id = `cap-${i}`;
  const t = c.start;
  const nw = c.text.trim().split(/\s+/).length;
  const variant = c.variant ?? VARIANTS[i % VARIANTS.length];
  if (variant === "wipe") {
    // plate wipes open along its length, tick rises, the line blurs in whole
    tl.fromTo(`#${id}-bgw`, { clipPath: "inset(-4px 100% -4px -40px)" }, { clipPath: "inset(-4px -40px -4px -40px)", duration: 0.45, ease: "expo.out" }, t);
    tl.fromTo(`#${id}-tickw`, { scaleY: 0 }, { scaleY: 1, duration: 0.3, ease: "expo.out" }, t + 0.08);
    tl.fromTo(`#${id}-text`, { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.2, ease: "expo.out" }, t + 0.1);
  } else if (variant === "words") {
    // plate and tick cut in, then word by word (blur 6 -> 0, 0.067 s apart, no translate)
    tl.fromTo(`#${id}-bgw`, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "power2.out" }, t);
    tl.fromTo(`#${id}-tickw`, { scaleY: 0 }, { scaleY: 1, duration: 0.3, ease: "expo.out" }, t);
    for (let j = 0; j < nw; j++)
      tl.fromTo(`#${id}-w${j}`, { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.13, ease: "power2.out" }, t + 0.06 + j * 0.067);
  } else {
    // "tick": the red tick leads in, the plate grows out of it, words go from dim to white
    tl.fromTo(`#${id}-tickw`, { x: -28, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: "expo.out" }, t);
    tl.fromTo(`#${id}-bgw`, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: "expo.out" }, t + 0.06);
    for (let j = 0; j < nw; j++)
      tl.fromTo(`#${id}-w${j}`, { opacity: 0.0, color: "rgba(255,255,255,0.0)" }, { opacity: 1, color: "rgba(255,255,255,1)", duration: 0.16, ease: "power2.out" }, t + 0.14 + j * 0.06);
  }
  // exit: one clean move, shorter than the entrance; then a hard hide
  const out = Math.max(t + 0.5, c.end - 0.18);
  tl.fromTo(`#${id}-plate`, { opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(6px)", duration: Math.min(0.18, c.end - out), ease: "power3.in" }, out);
  tl.set(`#${id}-plate`, { visibility: "hidden" }, c.end);
}

/**
 * captionsScene({ id, duration, items: [{ text, start, end, variant? }] }) -> composition file source.
 * Times are film seconds (the captions host starts at 0). variant: "wipe" | "words" | "tick";
 * defaults cycle through them.
 */
export function captionsScene({ id = "captions", duration, items }) {
  const tl = new Timeline();
  items.forEach((c, i) => enter(tl, c, i));
  return sceneFile({ id, duration, css, html: items.map(group).join("\n"), tl });
}

/** captionsPart(items) -> { css, html, tl } for embedding captions in another scene. */
export function captionsPart(items) {
  const tl = new Timeline();
  items.forEach((c, i) => enter(tl, c, i));
  return { css, html: items.map(group).join("\n"), tl };
}

/** toSrt(items) -> the .srt sidecar from the same data. */
export function toSrt(items) {
  const ts = (t) => {
    const ms = Math.round(t * 1000);
    const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
    const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
    return `${h}:${m}:${s},${String(ms % 1000).padStart(3, "0")}`;
  };
  return items.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join("\n");
}
