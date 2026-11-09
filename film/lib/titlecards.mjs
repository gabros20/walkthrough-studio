// Title card and end card. Both are full scene files built from:
//   creatives: [{ src, w, h }] (the manifest), lines: [string, string], timings in scene seconds.

import { BRAND, COLOR, FILM, SHAPE, TYPE, WINDOW } from "./config.mjs";
import { esc, n, sceneFile, Timeline, merge } from "./emit.mjs";
import { lockup, lockupIn, lockupOut } from "./lockup.mjs";
import { slantWipe } from "./transitions.mjs";

const T = TYPE.title;

/** Two title lines, left-aligned at x, each word its own span (ids <id>-l<i>-w<j>). */
function titleLines({ id, lines, x, y }) {
  const lh = T.size * T.lineHeight;
  const css = `
    #${id} { position: absolute; left: ${x}px; top: ${y}px; font-family: ${FILM.fontStack}; font-size: ${T.size}px; font-weight: ${T.weight}; letter-spacing: ${T.tracking}; line-height: ${n(lh)}px; color: ${COLOR.white}; white-space: nowrap; }
    #${id} .w { display: inline-block; }`;
  const html = `    <div id="${id}">
${lines
  .map(
    (l, i) =>
      `      <div id="${id}-l${i}">${l
        .split(/\s+/)
        .map((w, j) => `<span class="w" id="${id}-l${i}-w${j}">${esc(w)}</span>`)
        .join(" ")}</div>`,
  )
  .join("\n")}
    </div>`;
  return { css, html, height: lh * lines.length };
}

/** Per word: blur 6 -> 0 and opacity 0 -> 1 in 0.13 s, 0.067 s apart, no translate. */
function wordsBlurIn(tl, id, line, words, at) {
  for (let j = 0; j < words; j++)
    tl.fromTo(`#${id}-l${line}-w${j}`, { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.13, ease: "power2.out" }, at + j * 0.067);
}
/** The line appears as a dim ghost, then word by word goes to white, 0.08 s apart, no position change. */
function wordsGreyIn(tl, id, line, words, at) {
  tl.fromTo(`#${id}-l${line}`, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "power2.out" }, at);
  for (let j = 0; j < words; j++)
    tl.fromTo(`#${id}-l${line}-w${j}`, { color: COLOR.ghost }, { color: COLOR.white, duration: 0.22, ease: "power2.out" }, at + 0.12 + j * 0.08);
}
/** The whole line blurring in, 8 px -> 0 in 0.18 s. */
function lineBlurIn(tl, id, line, at) {
  tl.fromTo(`#${id}-l${line}`, { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.18, ease: "expo.out" }, at);
}

// The text block: lockup above two title lines, left edge on the window's left edge (x 192),
// optically centred a little above the middle.
function textBlock({ id, lines, logoHeight = 84 }) {
  const gap = 64;
  const lh = T.size * T.lineHeight * lines.length;
  const blockH = logoHeight + gap + lh;
  const top = Math.round((FILM.height - blockH) / 2 - 24);
  const lk = lockup({ id: `${id}-lk`, logoHeight, x: WINDOW.left, y: top });
  const tx = titleLines({ id: `${id}-tx`, lines, x: WINDOW.left - 4, y: top + logoHeight + gap });
  return { lk, tx };
}

/**
 * titleScene({ id, creatives, lines, duration }) -> scene file source.
 * 0-1.6 s: the creatives burst onto a full-frame wall (4 x 2 cells, diagonal sweep, the wall
 * pushes in). 1.45 s: the accent slant wipe crosses left to right; under it the wall is replaced by
 * ink and the lockup lands, then line 1 word by word (blur), line 2 word by word (grey to white).
 * Holds, then the text blurs out by `duration` for a hard cut to the stage.
 */
export function titleScene({ id = "title", creatives, lines = BRAND.cards.title, duration = 8, panelItems = [8, 9, 10] }) {
  // Two rows of the creatives at their own aspect (never cropped), each row scaled to span the
  // frame inside a 10 px ink margin, rows centred vertically. 10 px ink gutters.
  const g = 10;
  const cells = creatives.slice(0, 8);
  const rows = [cells.slice(0, Math.ceil(cells.length / 2)), cells.slice(Math.ceil(cells.length / 2))];
  const rowHs = rows.map((row) => (FILM.width - 2 * g - g * (row.length - 1)) / row.reduce((a, c) => a + c.w / c.h, 0));
  const top0 = (FILM.height - rowHs[0] - rowHs[1] - g) / 2;
  const placed = [];
  rows.forEach((row, r) => {
    const rowH = rowHs[r];
    let x = g;
    row.forEach((c, j) => {
      const w = (rowH * c.w) / c.h;
      placed.push({ c, x, y: r === 0 ? top0 : top0 + rowHs[0] + g, w, h: rowH, col: j, row: r, n: row.length });
      x += w + g;
    });
  });
  // Burst order: from the centre of the top row outward, the lower row a half step behind.
  const order = placed.map((p, i) => ({ i, k: Math.abs(p.col - (p.n - 1) / 2) * 2 + p.row * 0.7 + p.col * 0.01 })).sort((a, b) => a.k - b.k);
  const wipeStart = 1.45, wipeDur = 0.9, cut = wipeStart + wipeDur / 2;
  const wall = {
    css: `
    #${id}-ground { position: absolute; inset: 0; background: ${COLOR.ink}; }
    #${id}-wall, #${id}-wall-in { position: absolute; inset: 0; }
    #${id}-wall .cell { position: absolute; overflow: hidden; background: #1d1d1d; }
    #${id}-wall .cell img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }`,
    html: `    <div id="${id}-ground"></div>
    <div id="${id}-wall" class="clip" data-start="0" data-duration="${n(cut)}" data-layout-allow-overflow><div id="${id}-wall-in">
${placed
  .map((p, i) => `      <div class="cell" id="${id}-c${i}" style="left:${n(p.x)}px; top:${n(p.y)}px; width:${n(p.w)}px; height:${n(p.h)}px"><img id="${id}-c${i}-img" src="${esc(p.c.src)}" alt="" /></div>`)
  .join("\n")}
    </div></div>`,
    tl: new Timeline(),
  };
  order.forEach(({ i }, s) => {
    // the first cell is already on screen at 0 s (the thumbnail frame), the rest burst in
    const at = s === 0 ? 0 : 0.08 + (s - 1) * 0.1;
    if (s > 0) wall.tl.fromTo(`#${id}-c${i}`, { opacity: 0 }, { opacity: 1, duration: 0.08, ease: "power2.out" }, at);
    if (s > 0) wall.tl.fromTo(`#${id}-c${i}-img`, { scale: 1.25 }, { scale: 1, duration: 0.7, ease: "expo.out" }, at);
  });

  const wipe = slantWipe({ id: `${id}-wipe`, start: wipeStart, dur: wipeDur, dir: 1 });
  const { lk, tx } = textBlock({ id, lines });
  const text = { css: lk.css + tx.css, html: `    <div id="${id}-text" class="clip" data-start="${n(wipe.cut)}" data-duration="${n(duration - wipe.cut)}" data-hold>\n${lk.html}\n${tx.html}\n    </div>`, tl: new Timeline() };
  const land = wipe.cut + 0.05;
  text.tl.add(lockupIn({ id: `${id}-lk`, at: land }));
  const w0 = lines[0].split(/\s+/).length, w1 = lines[1].split(/\s+/).length;
  wordsBlurIn(text.tl, `${id}-tx`, 0, w0, land + 0.75);
  wordsGreyIn(text.tl, `${id}-tx`, 1, w1, land + 0.75 + w0 * 0.067 + 0.25);
  // exit: text and lockup blur out together just before the cut
  const out = duration - 0.3;
  text.tl.fromTo(`#${id}-tx`, { opacity: 1, filter: "blur(0px)" }, { opacity: 0, filter: "blur(8px)", duration: 0.22, ease: "power3.in" }, out);
  text.tl.add(lockupOut({ id: `${id}-lk`, at: out, dur: 0.22 }));
  // the creatives stay in the picture: a slant-edged column on the right, drifting up
  const panel = slantPanel({ id: `${id}-pn`, items: pick(creatives, panelItems), start: wipe.cut, end: duration, dir: -1 });

  const m = merge(wall, panel, text, wipe);
  return sceneFile({ id, duration, ...m });
}

const pick = (creatives, idx) => idx.map((i) => creatives[i % creatives.length]);

// The right-hand column: its left edge leans like the brand's button ("/", shape.slantDeg) and passes ~85 px
// clear of the end of the longest title line (x ~1425 at y ~700).
const PANEL = { deg: SHAPE.slantDeg, through: { x: 1510, y: 700 }, gap: 12, speed: 42 };

/**
 * slantPanel({ id, items, start, end, dir }) -> part
 * A full-height column on the right, masked by a slanted left edge and the frame edge, holding the
 * creatives stacked at full brightness, drifting at a constant 42 px/s (dir -1 up, +1 down).
 */
export function slantPanel({ id, items, start, end, dir = -1 }) {
  const t = Math.tan((PANEL.deg * Math.PI) / 180);
  const topX = PANEL.through.x + t * PANEL.through.y;
  const botX = PANEL.through.x - t * (FILM.height - PANEL.through.y);
  const left = Math.floor(botX) - 4;
  const w = FILM.width - left;
  // an item may carry crop [x0, y0, x1, y1] (fractions): only that photo band is shown, so the
  // slanted edge never cuts through a headline
  const cr = (c) => c.crop ?? [0, 0, 1, 1];
  const hs = items.map((c) => { const [x0, y0, x1, y1] = cr(c); return (w * (c.h * (y1 - y0))) / (c.w * (x1 - x0)); });
  const stackH = hs.reduce((a, b) => a + b, 0) + PANEL.gap * (items.length - 1);
  const travel = PANEL.speed * (end - start);
  // place the stack so the frame stays covered over the whole drift
  const y0 = dir < 0 ? -Math.max(0, (stackH - FILM.height - travel) / 2) : FILM.height - stackH + Math.max(0, (stackH - FILM.height - travel) / 2);
  const css = `
    #${id} { position: absolute; inset: 0; clip-path: polygon(${n(topX)}px 0, ${FILM.width}px 0, ${FILM.width}px ${FILM.height}px, ${n(botX)}px ${FILM.height}px); }
    #${id}-col { position: absolute; left: ${left}px; top: 0; width: ${w}px; }
    #${id}-col .pi { position: relative; width: ${w}px; overflow: hidden; margin-bottom: ${PANEL.gap}px; }
    #${id}-col .pi img { position: absolute; display: block; }`;
  const html = `    <div id="${id}" class="clip" data-start="${n(start)}" data-duration="${n(end - start)}" data-layout-allow-overflow>
      <div id="${id}-col">
${items
  .map((c, i) => {
    const [x0, y0, x1, y1] = cr(c);
    const iw = w / (x1 - x0), ih = hs[i] / (y1 - y0);
    return `        <div class="pi" id="${id}-i${i}" style="height:${n(hs[i])}px"><img src="${esc(c.src)}" alt="" style="width:${n(iw)}px; height:${n(ih)}px; left:${n(-x0 * iw)}px; top:${n(-y0 * ih)}px" /></div>`;
  })
  .join("\n")}
      </div>
    </div>`;
  const tl = new Timeline().fromTo(`#${id}-col`, { y: y0 }, { y: y0 + dir * travel, duration: end - start, ease: "none" }, start);
  return { css, html, tl };
}

/**
 * endScene({ id, creatives, lines, duration }) -> scene file source.
 * 0-1.1 s: the kit files deal out into a clean cascade (upright, even step, bottoms on one
 * baseline, each over the last), then hold while the cascade pushes in slightly. 2.4 s: the accent
 * slant closes over them right to left; under it, ink, the lockup and the closing line (landed by
 * ~3.5 s, dead still to the end, >= 3 s) and the same slant column as the title, drifting down.
 */
export function endScene({ id = "end", creatives, lines = BRAND.cards.end, duration = 7, panelItems = [16, 17, 18], cascadeItems = [11, 12, 13, 14, 15], wipeStart = 2.4 }) {
  const cards = pick(creatives, cascadeItems);
  const N = cards.length;
  const H = 640, base = 870, margin = 150;
  const ws = cards.map((c) => (H * c.w) / c.h);
  const step = (FILM.width - 2 * margin - ws[N - 1]) / (N - 1);
  const xs = cards.map((_, i) => margin + i * step);
  const cas = { css: `
    #${id}-ground { position: absolute; inset: 0; background: ${COLOR.ink}; }
    #${id}-cas, #${id}-cas-in { position: absolute; inset: 0; }
    #${id}-cas .card { position: absolute; top: ${base - H}px; height: ${H}px; border-radius: 6px; overflow: hidden; box-shadow: -18px 0 40px rgba(0,0,0,.5); }
    #${id}-cas .card img { display: block; height: 100%; width: 100%; }`, html: "", tl: new Timeline() };
  cas.html = `    <div id="${id}-ground"></div>
    <div id="${id}-cas" class="clip" data-start="0" data-duration="${n(wipeStart + 0.5)}" data-layout-allow-overlap><div id="${id}-cas-in">
${cards.map((c, i) => `      <div class="card" id="${id}-k${i}" style="left:${n(xs[i])}px; width:${n(ws[i])}px; z-index:${i + 1}"><img src="${esc(c.src)}" alt="" /></div>`).join("\n")}
    </div></div>`;
  cards.forEach((c, i) => {
    // the deck sits on the first slot; each card deals out to its slot, left to right, no fades
    if (i > 0) cas.tl.fromTo(`#${id}-k${i}`, { x: xs[0] - xs[i] }, { x: 0, duration: 0.9, ease: "expo.out" }, 0.08 + (i - 1) * 0.07);
  });
  cas.tl.fromTo(`#${id}-cas-in`, { scale: 1 }, { scale: 1.03, duration: wipeStart + 0.5, ease: "power1.out", transformOrigin: "50% 60%" }, 0);

  const wipe = slantWipe({ id: `${id}-wipe`, start: wipeStart, dur: 0.9, dir: -1 });
  const { lk, tx } = textBlock({ id, lines });
  const text = { css: lk.css + tx.css, html: `    <div id="${id}-text" class="clip" data-start="${n(wipe.cut)}" data-duration="${n(duration - wipe.cut)}" data-hold>\n${lk.html}\n${tx.html}\n    </div>`, tl: new Timeline() };
  const land = wipe.cut + 0.05;
  text.tl.add(lockupIn({ id: `${id}-lk`, at: land }));
  lineBlurIn(text.tl, `${id}-tx`, 0, land + 0.35);
  lineBlurIn(text.tl, `${id}-tx`, 1, land + 0.5);
  const panel = slantPanel({ id: `${id}-pn`, items: pick(creatives, panelItems), start: wipe.cut, end: duration, dir: 1 });

  const m = merge(cas, panel, text, wipe);
  return sceneFile({ id, duration, ...m });
}
