// Title card and end card. Both are full scene files built from:
//   creatives: [{ src, w, h }] (the manifest), lines: [string, string], timings in scene seconds.
//
// Two layouts (lib/config.mjs CARDS.layout, from the aspect):
//   side     16:9: the lockup and the two lines left-aligned at the window's left edge (x 192),
//            the creatives in a slant-edged column on the right
//   stacked  9:16 and 1:1: the lockup on top, the lines under it (each wrapped to the width when it
//            would not fit), the creatives in a strip along the bottom; the title wall has more rows
//            and the end cascade is sized to the canvas

import { BRAND, CARDS, COLOR, FILM, SHAPE, TYPE } from "./config.mjs";
import { esc, n, sceneFile, Timeline, merge } from "./emit.mjs";
import { lockup, lockupIn, lockupOut } from "./lockup.mjs";
import { slantWipe } from "./transitions.mjs";

const T = TYPE.title;

// average glyph width of the title type in em (weight 900, -1.5% tracking), for wrapping estimates only
const TITLE_EM = 0.56;

/**
 * A title line split into the visual lines it takes inside maxWidth (greedy, from the glyph-width
 * estimate): [[word, ...], ...]; one visual line when maxWidth is not given or it fits.
 */
function wrapLine(text, maxWidth) {
  const words = text.split(/\s+/);
  if (!maxWidth) return [words];
  const fits = (ws) => ws.join(" ").length * T.size * TITLE_EM <= maxWidth;
  const out = [[]];
  for (const w of words) {
    const cur = out[out.length - 1];
    if (cur.length && !fits([...cur, w])) out.push([w]);
    else cur.push(w);
  }
  return out;
}

/**
 * Two title lines, left-aligned at x, each word its own span (ids <id>-l<i>-w<j>). maxWidth
 * (stacked layout): a line wider than that breaks onto more rows inside its own line block, so the
 * word ids and the line-by-line entrances stay the same.
 */
function titleLines({ id, lines, x, y, maxWidth = null }) {
  const lh = T.size * T.lineHeight;
  const css = `
    #${id} { position: absolute; left: ${x}px; top: ${y}px; font-family: ${FILM.fontStack}; font-size: ${T.size}px; font-weight: ${T.weight}; letter-spacing: ${T.tracking}; line-height: ${n(lh)}px; color: ${COLOR.white}; white-space: nowrap; }
    #${id} .w { display: inline-block; }`;
  const rows = lines.map((l) => wrapLine(l, maxWidth));
  const html = `    <div id="${id}">
${lines
  .map((l, i) => {
    let j = 0;
    return `      <div id="${id}-l${i}">${rows[i].map((ws) => ws.map((w) => `<span class="w" id="${id}-l${i}-w${j++}">${esc(w)}</span>`).join(" ")).join("<br>")}</div>`;
  })
  .join("\n")}
    </div>`;
  return { css, html, height: lh * rows.reduce((a, r) => a + r.length, 0) };
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

// The text block: lockup above two title lines. Side: left edge on the window's left edge (x 192),
// optically centred a little above the middle. Stacked: at CARDS.x, the lines wrapped to the
// width, centred in the area above the bottom strip.
function textBlock({ id, lines, logoHeight = CARDS.lockupHeight }) {
  const gap = CARDS.gap;
  if (CARDS.layout === "stacked") {
    const maxWidth = FILM.width - 2 * CARDS.x;
    const probe = titleLines({ id: `${id}-tx`, lines, x: 0, y: 0, maxWidth });
    const blockH = logoHeight + gap + probe.height;
    const top = Math.round((FILM.height - CARDS.strip.height - blockH) / 2);
    const lk = lockup({ id: `${id}-lk`, logoHeight, x: CARDS.x, y: top });
    const tx = titleLines({ id: `${id}-tx`, lines, x: CARDS.x - 3, y: top + logoHeight + gap, maxWidth });
    return { lk, tx };
  }
  const lh = T.size * T.lineHeight * lines.length;
  const blockH = logoHeight + gap + lh;
  const top = Math.round((FILM.height - blockH) / 2 - 24);
  const lk = lockup({ id: `${id}-lk`, logoHeight, x: CARDS.x, y: top });
  const tx = titleLines({ id: `${id}-tx`, lines, x: CARDS.x - 4, y: top + logoHeight + gap });
  return { lk, tx };
}

/** The creatives beside or under the text: the slant column (side) or the bottom strip (stacked). */
function cardPanel({ pool, ...args }) {
  return CARDS.layout === "stacked" ? stripPanel({ ...args, pool }) : slantPanel(args);
}

/**
 * titleScene({ id, creatives, lines, duration }) -> scene file source.
 * 0-1.6 s: the creatives burst onto a full-frame wall (4 x 2 cells, diagonal sweep, the wall
 * pushes in). 1.45 s: the accent slant wipe crosses left to right; under it the wall is replaced by
 * ink and the lockup lands, then line 1 word by word (blur), line 2 word by word (grey to white).
 * Holds, then the text blurs out by `duration` for a hard cut to the stage.
 */
export function titleScene({ id = "title", creatives, lines = BRAND.cards.title, duration = 8, panelItems = [8, 9, 10] }) {
  // Rows of the creatives at their own aspect (never cropped), each row scaled to span the frame
  // inside a 10 px ink margin, rows centred vertically (taller than the frame in portrait: the
  // wall is cropped top and bottom). 10 px ink gutters. Two rows of four at 16:9; CARDS.wallRows.
  const g = 10;
  const cells = creatives.slice(0, 8);
  const per = Math.ceil(cells.length / CARDS.wallRows);
  const rows = Array.from({ length: CARDS.wallRows }, (_, r) => cells.slice(r * per, (r + 1) * per)).filter((row) => row.length);
  const rowHs = rows.map((row) => (FILM.width - 2 * g - g * (row.length - 1)) / row.reduce((a, c) => a + c.w / c.h, 0));
  const top0 = (rowHs.reduce((a, h) => a - h, FILM.height) - g * (rows.length - 1)) / 2;
  const rowYs = rowHs.reduce((ys, h, r) => (r === 0 ? [top0] : [...ys, ys[r - 1] + rowHs[r - 1] + g]), []);
  const placed = [];
  rows.forEach((row, r) => {
    const rowH = rowHs[r];
    let x = g;
    row.forEach((c, j) => {
      const w = (rowH * c.w) / c.h;
      placed.push({ c, x, y: rowYs[r], w, h: rowH, col: j, row: r, n: row.length });
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
  const panel = cardPanel({ id: `${id}-pn`, items: pick(creatives, panelItems), start: wipe.cut, end: duration, dir: -1, pool: creatives });

  const m = merge(wall, panel, text, wipe);
  return sceneFile({ id, duration, ...m });
}

const pick = (creatives, idx) => idx.map((i) => creatives[i % creatives.length]);

// The right-hand column: its left edge leans like the brand's button ("/", shape.slantDeg) and passes ~85 px
// clear of the end of the longest title line (x ~1425 at y ~700; CARDS.through).
const PANEL = { deg: SHAPE.slantDeg, through: CARDS.through ?? { x: 1510, y: 700 }, gap: 12, speed: 42 };

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
 * stripPanel({ id, items, start, end, dir }) -> part   (stacked layout)
 * A full-width strip along the bottom of the frame (CARDS.strip.height tall) holding the creatives
 * side by side at full brightness, drifting at a constant 42 px/s (dir -1 left, +1 right). When the
 * items are too few to keep the frame covered over the whole drift, more creatives from `pool` are
 * added (ones not shown yet first; repeats only when the pool runs out).
 */
export function stripPanel({ id, items, start, end, dir = -1, pool = [] }) {
  const h = CARDS.strip.height, top = FILM.height - h;
  const cr = (c) => c.crop ?? [0, 0, 1, 1];
  const widthOf = (c) => { const [x0, y0, x1, y1] = cr(c); return (h * (c.w * (x1 - x0))) / (c.h * (y1 - y0)); };
  const travel = PANEL.speed * (end - start);
  const list = [...items];
  const total = () => list.reduce((a, c) => a + widthOf(c), 0) + PANEL.gap * (list.length - 1);
  const extra = [...pool.filter((c) => !list.some((x) => x.src === c.src)), ...items];
  for (let k = 0; extra.length && total() < FILM.width + travel && k < 24; k++) list.push(extra[k % extra.length]);
  const rowW = total();
  const spare = Math.max(0, (rowW - FILM.width - travel) / 2);
  const x0 = dir < 0 ? -spare : FILM.width - rowW + spare;
  const css = `
    #${id} { position: absolute; left: 0; top: ${top}px; width: ${FILM.width}px; height: ${h}px; overflow: hidden; }
    #${id}-row { position: absolute; left: 0; top: 0; height: ${h}px; width: ${n(rowW)}px; }
    #${id}-row .pi { position: absolute; top: 0; height: ${h}px; overflow: hidden; }
    #${id}-row .pi img { position: absolute; display: block; }`;
  let x = 0;
  const cells = list.map((c, i) => {
    const [cx0, cy0, cx1, cy1] = cr(c);
    const w = widthOf(c);
    const iw = w / (cx1 - cx0), ih = h / (cy1 - cy0);
    const cell = `        <div class="pi" id="${id}-i${i}" style="left:${n(x)}px; width:${n(w)}px"><img src="${esc(c.src)}" alt="" style="width:${n(iw)}px; height:${n(ih)}px; left:${n(-cx0 * iw)}px; top:${n(-cy0 * ih)}px" /></div>`;
    x += w + PANEL.gap;
    return cell;
  });
  const html = `    <div id="${id}" class="clip" data-start="${n(start)}" data-duration="${n(end - start)}" data-layout-allow-overflow>
      <div id="${id}-row">
${cells.join("\n")}
      </div>
    </div>`;
  const tl = new Timeline().fromTo(`#${id}-row`, { x: x0 }, { x: x0 + dir * travel, duration: end - start, ease: "none" }, start);
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
  const { margin } = CARDS.cascade; // 640 tall, baseline 870, margins 150 at 16:9
  let H = CARDS.cascade.height, base = CARDS.cascade.base;
  // stacked (narrow canvas): the cards shrink until the widest one ends inside the right margin
  if (CARDS.layout === "stacked") {
    const A = FILM.width - 2 * margin;
    const w = cards.map((c) => (H * c.w) / c.h);
    const f = Math.min(1, ...w.map((wi, i) => { const over = wi - (i * w[N - 1]) / (N - 1); return over > 0 && i < N - 1 ? (A * (N - 1 - i)) / (N - 1) / over : 1; }));
    H = Math.floor(H * f);
    base = Math.round(base - (CARDS.cascade.height - H) / 2); // stays centred where it was
  }
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
  const panel = cardPanel({ id: `${id}-pn`, items: pick(creatives, panelItems), start: wipe.cut, end: duration, dir: 1, pool: creatives });

  const m = merge(cas, panel, text, wipe);
  return sceneFile({ id, duration, ...m });
}
