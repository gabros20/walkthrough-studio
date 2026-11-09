// The header lockup on the title and end cards: logo (or a text wordmark), a hairline divider and
// an optional label, e.g. "[logo] | Content AI". Everything comes from the brand (lib/config.mjs):
//
//   lockup.logo      { onDark, onLight, aspect } or null. scripts/sync-assets.mjs copies the files
//                    into assets/brand/ and measures their aspect.
//   lockup.label     text after the divider, or null
//   lockup.divider   draw the divider (only when there is a label and something before it)
//   lockup.wordmark  text used in place of a logo; defaults to the brand name; "" for none
//   lockup.metrics   proportions on a 24-unit row (logo height 24), scaled to the requested height
//
// Without a logo the lockup degrades to text: wordmark | label, wordmark alone, label alone, or
// nothing (an empty block; lockupIn/lockupOut then emit no tweens).

import { existsSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { BRAND, COLOR, FILM_DIR, brandAsset } from "./config.mjs";
import { esc, n, Timeline } from "./emit.mjs";

const L = BRAND.lockup;
const M = L.metrics;

/**
 * The logo files to use: assets/brand/manifest.json (written by scripts/sync-assets.mjs) when it
 * lists them, else brand paths that already sit inside film/. null when the brand has no logo.
 */
export function logoFiles() {
  if (!L.logo) return null;
  const manifest = join(FILM_DIR, "assets/brand/manifest.json");
  if (existsSync(manifest)) {
    const m = JSON.parse(readFileSync(manifest, "utf8"));
    if (m.onDark || m.onLight) {
      const dark = m.onDark ?? m.onLight, light = m.onLight ?? m.onDark;
      return { onDark: dark.src, onLight: light.src, aspect: dark.w / dark.h };
    }
  }
  const inFilm = (p) => {
    const abs = brandAsset(p);
    const rel = abs && relative(FILM_DIR, abs);
    return rel && !rel.startsWith("..") && existsSync(abs) ? rel.split(sep).join("/") : null;
  };
  const dark = inFilm(L.logo.onDark ?? L.logo.onLight), light = inFilm(L.logo.onLight ?? L.logo.onDark);
  if (!dark) throw new Error("the brand names a logo but it is not in film/assets/brand: run node scripts/sync-assets.mjs");
  return { onDark: dark, onLight: light ?? dark, aspect: L.logo.aspect ?? 4 };
}

/** Which parts this brand's lockup has: { logo, wordmark, divider, label } (falsy = absent). */
export function lockupParts() {
  const logo = logoFiles();
  const wordmark = logo ? null : (L.wordmark ?? BRAND.name) || null;
  const label = L.label || null;
  return { logo, wordmark, label, divider: Boolean(L.divider && label && (logo || wordmark)) };
}

/**
 * lockup({ id, logoHeight, x, y, tone }) -> { css, html, k, width, height, parts }
 * Static markup; animate it with lockupIn(). (x, y) is the top-left of the row; logoHeight is the
 * row height (the logo's height when there is one). tone "dark" = on ink, "light" = on paper.
 */
export function lockup({ id, logoHeight = 96, x = 0, y = 0, tone = "dark" }) {
  const parts = lockupParts();
  const k = logoHeight / M.row;
  const gap = M.gap * k;
  const divW = Math.max(2, Math.round(k * 0.75 * M.dividerWidth)); // the 1 px hairline, kept a hairline at film size
  const divH = M.dividerHeight * k;
  const label = M.labelSize * k;
  const wm = M.wordmarkSize * k;
  const labelColor = tone === "dark" ? COLOR.muted : "#6B6B6B";
  const divColor = tone === "dark" ? "rgba(244,242,238,0.38)" : "rgba(20,20,20,0.24)";
  const textColor = tone === "dark" ? COLOR.text : COLOR.ink;
  const logoW = parts.logo ? parts.logo.aspect * logoHeight : 0;
  const wmW = parts.wordmark ? parts.wordmark.length * wm * 0.58 : 0; // estimate, for layout only
  const labelW = parts.label ? parts.label.length * label * M.labelEm : 0;
  const items = [logoW || wmW, parts.divider ? divW : 0, labelW].filter((w) => w > 0);
  const width = items.reduce((a, b) => a + b, 0) + gap * Math.max(0, items.length - 1);
  // with a logo the divider and label sit low on the row (as in the app header); text-only they centre
  const drop = parts.logo ? 1 : 0;
  // css only for the parts that exist (the lockup inherits the composition's font)
  const css = [
    `\n    #${id} { position: absolute; left: ${n(x)}px; top: ${n(y)}px; height: ${n(logoHeight)}px; display: flex; align-items: center; gap: ${n(gap)}px; }`,
    parts.logo && `\n    #${id}-logo { display: block; height: ${n(logoHeight)}px; width: ${n(logoW)}px; }`,
    parts.wordmark && `\n    #${id}-wm { font-size: ${n(wm)}px; font-weight: ${M.wordmarkWeight}; letter-spacing: ${M.wordmarkTracking}; color: ${textColor}; white-space: nowrap; line-height: 1; }`,
    parts.divider && `\n    #${id}-div { width: ${divW}px; height: ${n(divH)}px; background: ${divColor}; margin-top: ${n(drop * M.dividerDrop * k)}px; transform-origin: 50% 100%; }`,
    parts.label && `\n    #${id}-label { font-size: ${n(label)}px; font-weight: ${M.labelWeight}; letter-spacing: ${M.labelTracking}; color: ${labelColor}; white-space: nowrap; line-height: 1; margin-top: ${n(drop * M.labelDrop * k)}px; }`,
  ]
    .filter(Boolean)
    .join("");
  const src = parts.logo ? (tone === "dark" ? parts.logo.onDark : parts.logo.onLight) : null;
  const html = `    <div id="${id}">
${[
  src ? `      <img id="${id}-logo" src="${esc(src)}" alt="${esc(BRAND.name)}" />` : "",
  parts.wordmark ? `      <div id="${id}-wm">${esc(parts.wordmark)}</div>` : "",
  parts.divider ? `      <div id="${id}-div"></div>` : "",
  parts.label ? `      <div id="${id}-label">${esc(parts.label)}</div>` : "",
]
  .filter(Boolean)
  .join("\n")}
    </div>`;
  return { css, html, k, width, height: logoHeight, parts };
}

/**
 * lockupIn({ id, at }) -> Timeline. The logo (or wordmark) lands (blur 10 -> 0, scale 1.06 -> 1,
 * expo.out), the divider draws upward, the label blurs in. Lands within 0.75 s, then holds still.
 */
export function lockupIn({ id, at }) {
  const p = lockupParts();
  const tl = new Timeline();
  const mark = p.logo ? `#${id}-logo` : p.wordmark ? `#${id}-wm` : null;
  if (mark) tl.fromTo(mark, { opacity: 0, scale: 1.06, filter: "blur(10px)", transformOrigin: "0% 50%" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.6, ease: "expo.out" }, at);
  if (p.divider) tl.fromTo(`#${id}-div`, { scaleY: 0 }, { scaleY: 1, duration: 0.35, ease: "expo.out" }, at + 0.22);
  if (p.label) tl.fromTo(`#${id}-label`, { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "expo.out" }, at + (mark ? 0.32 : 0));
  return tl;
}

/** lockupOut({ id, at, dur }) -> Timeline: one clean exit (power3.in). */
export function lockupOut({ id, at, dur = 0.25 }) {
  const p = lockupParts();
  const tl = new Timeline();
  if (p.logo || p.wordmark || p.label) tl.fromTo(`#${id}`, { opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(8px)", duration: dur, ease: "power3.in" }, at);
  return tl;
}
