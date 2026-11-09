// twins.mp4: one picture lock, two films. The same stage (mock app, drawn pointer, camera, two hard
// cuts) is built twice from one function; the left copy carries the caption plates (the kit's
// captionsPart), the right one a voice waveform and no captions (build.mjs --no-captions). A thin
// shared timeline underneath shows the caption spans, the voice spans and the same two cuts.

import { snap, K } from "../../../film/lib/config.mjs";
import { n, sceneFile, Timeline, merge } from "../../../film/lib/emit.mjs";
import { Pointer, moveDuration, MOTION, pointerPlace } from "../../../film/lib/pointer.mjs";
import { Camera } from "../../../film/lib/camera.mjs";
import { captionsPart, lintCaptions } from "../../../film/lib/captions.mjs";
import { mockApp, center } from "../lib/mockapp.mjs";
import { appStage } from "./hero.mjs";
import { PAL, MONO, SANS } from "../lib/type.mjs";

export const DURATION = 8;
const CUTS = [2.7, 5.3];
const S = 0.545; // panel scale of the stage
const CROP = { x: 162, y: 20, w: 1596, h: 1030 }; // stage region shown in a panel
const PW = Math.round(CROP.w * S), PH = Math.round(CROP.h * S); // 870 x 561
const PANELS = [{ x: 60, y: 150 }, { x: 1920 - 60 - PW, y: 150 }];
const LINES = [
  { text: "Generate from one prompt", start: 0.5, end: 2.6, variant: "wipe" },
  { text: "Every card loads in place", start: 2.85, end: 5.2, variant: "words" },
  { text: "Turn on a share link", start: 5.45, end: 7.9, variant: "tick" },
];

/** The picture lock: one function, called once per twin. */
function picture(sid) {
  const app = mockApp({ p: sid, scale: "big", K, settings: true });
  const B = app.boxes;
  const cam = new Camera({ stage: sid });
  const tl = new Timeline();
  const OFF = { x: 1600, y: 900 };
  const p = new Pointer({ id: `${sid}-ptr`, point: OFF });
  p.show(0);

  // shot A: enter, click Generate, the cards drop to skeletons
  const btn = center(B.btn);
  let t = 0.3, d = moveDuration(OFF, btn);
  p.move({ to: btn, start: snap(t), end: snap(t + d) });
  p.shape({ at: snap(t + d), shape: "hand" });
  const click = snap(t + d + MOTION.clickLead);
  p.click({ at: click });
  const L0 = snap(click + 0.08);
  const resolve = [3.15, 3.55, 3.95];
  B.cards.forEach((c, i) => {
    const s0 = snap(L0 + i * 0.05);
    tl.fromTo(`#${sid}-sk${i}`, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "power2.out" }, s0);
    tl.fromTo(`#${sid}-cc${i}`, { opacity: 1 }, { opacity: 0, duration: 0.12, ease: "power2.out" }, s0);
    tl.fromTo(`#${sid}-skhi${i}`, { x: -200 }, { x: c.w + 20, duration: 0.6, ease: "power1.inOut", repeat: 2 }, s0 + 0.06);
    tl.set(`#${sid}-cc${i}`, { opacity: 1 }, resolve[i]);
    tl.fromTo(`#${sid}-sk${i}`, { clipPath: "inset(0% 0% 0% 0%)" }, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.5, ease: "expo.out" }, resolve[i]);
    tl.fromTo(`#${sid}-ttl${i}`, { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "expo.out", immediateRender: false }, resolve[i] + 0.1);
  });
  tl.fromTo(`#${sid}-btnl`, { opacity: 1 }, { opacity: 0.5, duration: 0.12, ease: "power2.out" }, L0);
  tl.fromTo(`#${sid}-btnl`, { opacity: 0.5 }, { opacity: 1, duration: 0.2, ease: "expo.out" }, resolve[2] + 0.2);

  // cut 1: straight to the first two cards (pane framing), held while they load
  // (the composer and the first two cards; scale 1.34 is the largest that keeps the composer whole
  // while the camera's clamp holds the window down to the caption band)
  const pair = { x: B.cards[0].x, y: 196, w: B.cards[1].x + B.cards[1].w - B.cards[0].x, h: B.cards[0].y + B.cards[0].h - 196 };
  cam.frame({ box: pair, kind: "pane", scale: 1.34, at: CUTS[0], dur: 0.001 });

  // cut 2: the settings page, wide; the pointer is already on the page and flips the share link
  cam.wide({ at: CUTS[1], dur: 0.001 });
  tl.set(`#${sid}-set`, { opacity: 1 }, CUTS[1]);
  tl.set(`#${sid}-main`, { opacity: 0 }, CUTS[1]);
  const rest = { x: 860, y: 640 };
  p.tl.add(pointerPlace({ id: p.id, at: CUTS[1], point: rest }));
  p.pos = rest;
  p.shape({ at: CUTS[1], shape: "arrow" });
  const sw = { x: 1340, y: 396 };
  t = snap(CUTS[1] + 0.45); d = moveDuration(rest, sw);
  p.move({ to: sw, start: t, end: snap(t + d) });
  p.shape({ at: snap(t + d), shape: "hand" });
  const flip = snap(t + d + MOTION.clickLead);
  p.click({ at: flip });
  tl.fromTo(`#${sid}-sw1k`, { x: 0 }, { x: 48, duration: 0.3, ease: "expo.out" }, flip + 0.04);
  tl.fromTo(`#${sid}-sw1f`, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: "power2.out" }, flip + 0.04);

  return { app, parts: { overlay: [p.part()], extra: [cam.part(), { tl }] } };
}

// deterministic speech-like amplitudes
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function build() {
  const id = "twins";
  const lint = lintCaptions(LINES);
  if (lint.length) console.warn("twins captions:\n  " + lint.join("\n  "));
  let css = `
    #tw-ground { position: absolute; inset: 0; background: ${PAL.ink}; }
    .tw-panel { position: absolute; width: ${PW}px; height: ${PH}px; overflow: hidden; border-radius: 12px; box-shadow: 0 0 0 2px ${PAL.line}; }
    .tw-inner { position: absolute; left: ${n(-CROP.x * S)}px; top: ${n(-CROP.y * S)}px; width: 1920px; height: 1080px; transform: scale(${S}); transform-origin: 0 0; }
    .tw-lbl { position: absolute; top: 72px; display: flex; align-items: baseline; gap: 22px; white-space: nowrap; }
    .tw-lbl b { font-family: ${SANS}; font-size: 48px; font-weight: 800; letter-spacing: -0.015em; font-variation-settings: "wdth" 112; color: ${PAL.white}; }
    .tw-lbl span { font-family: ${MONO}; font-size: 28px; color: ${PAL.muted}; }
    .cap-text { font-size: 48px !important; }`;
  let html = `    <div id="tw-ground"></div>`;
  const tl = new Timeline();

  ["tl", "tr"].forEach((sid, k) => {
    const pic = picture(sid);
    const st = appStage({ id: sid, app: pic.app, parts: pic.parts });
    // captions / waveform sit in the stage's ink band (stage px), outside the camera
    let band = { css: "", html: "", tl: new Timeline() };
    if (k === 0) band = captionsPart(LINES);
    else band = waveform(sid);
    const m = merge(st, band);
    css += m.css;
    tl.add(m.tl);
    const P = PANELS[k];
    html += `
    <div class="tw-panel" id="${sid}-panel" style="left:${P.x}px; top:${P.y}px" data-layout-allow-overflow>
      <div class="tw-inner" data-layout-allow-overflow data-layout-ignore>
${m.html}
      </div>
    </div>`;
  });
  html += `
    <div class="tw-lbl" style="left:${PANELS[0].x}px"><b>Captions</b><span>build.mjs</span></div>
    <div class="tw-lbl" style="left:${PANELS[1].x}px"><b>Voiceover</b><span>build.mjs --no-captions</span></div>`;

  // ---------- the shared timeline ----------
  const TX = 300, TW = 1920 - 60 - TX, PPS = TW / DURATION;
  const X = (t) => n(TX + t * PPS);
  const rowY = { cap: 762, rule: 830, voice: 852 };
  css += `
    .tw-row { position: absolute; left: 60px; height: 40px; display: flex; align-items: center; font-family: ${MONO}; font-size: 28px; color: ${PAL.muted}; }
    .tw-span { position: absolute; height: 34px; }
    .tw-span.c { background: ${PAL.plate}; border-left: 6px solid ${PAL.key}; }
    .tw-span.v { background: repeating-linear-gradient(90deg, ${PAL.muted} 0 4px, transparent 4px 9px); opacity: 0.55; }
    #tw-rule { position: absolute; left: ${TX}px; top: ${rowY.rule - 1}px; width: ${TW}px; height: 2px; background: ${PAL.line}; }
    .tw-cut { position: absolute; top: ${rowY.cap - 6}px; width: 4px; height: ${rowY.voice + 40 - rowY.cap + 12}px; margin-left: -2px; background: ${PAL.line}; }
    .tw-cutl { position: absolute; top: ${rowY.voice + 58}px; font-family: ${MONO}; font-size: 28px; color: ${PAL.muted}; white-space: nowrap; transform: translateX(-50%); }
    #tw-head { position: absolute; left: ${TX}px; top: ${rowY.cap - 14}px; width: 2px; height: ${rowY.voice + 40 - rowY.cap + 28}px; margin-left: -1px; background: ${PAL.white}; }`;
  html += `
    <div class="tw-row" style="top:${rowY.cap}px">captions</div>
    <div class="tw-row" style="top:${rowY.voice}px">voice</div>
    <div id="tw-rule"></div>
${LINES.map((c, i) => `    <div class="tw-span c" style="left:${X(c.start)}px; top:${rowY.cap + 3}px; width:${n((c.end - c.start) * PPS)}px"></div>
    <div class="tw-span v" style="left:${X(c.start)}px; top:${rowY.voice + 3}px; width:${n((c.end - c.start - 0.2) * PPS)}px"></div>`).join("\n")}
${CUTS.map((c, i) => `    <div class="tw-cut" id="tw-cut${i}" style="left:${X(c)}px"></div>
    <div class="tw-cutl" id="tw-cutl${i}" style="left:${X(c)}px">cut ${c.toFixed(1)} s</div>`).join("\n")}
    <div id="tw-head"></div>`;
  tl.fromTo("#tw-head", { x: 0 }, { x: TW, duration: DURATION, ease: "none" }, 0);
  CUTS.forEach((c, i) => {
    tl.set(`#tw-cut${i}`, { backgroundColor: PAL.key }, c);
    tl.set(`#tw-cutl${i}`, { color: PAL.white }, c);
  });

  return {
    duration: DURATION,
    scenes: [{ id, file: sceneFile({ id, duration: DURATION, css, html, tl }) }],
  };
}

/** A voice waveform scrolling under a fixed playhead, in the stage's caption band (stage px). */
function waveform(sid) {
  const PPS = 150, WIN = 820, BAR = 9;
  const r = rng(7);
  const total = DURATION * PPS + WIN;
  let rects = "";
  for (let x = 0; x < total; x += BAR) {
    const t = (x - WIN / 2) / PPS; // film time under the playhead when this bar is at the centre
    const line = LINES.find((c) => t >= c.start && t <= c.end - 0.2);
    let h = 3;
    if (line) {
      const u = (t - line.start) / (line.end - 0.2 - line.start);
      const env = Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.5;
      const syll = 0.45 + 0.55 * Math.abs(Math.sin(t * 17.3 + r() * 2));
      h = Math.max(4, 54 * env * syll * (0.6 + 0.4 * r()));
    }
    rects += `<rect x="${x}" y="${n(32 - h / 2)}" width="5" height="${n(h)}" rx="2.5"/>`;
  }
  const css = `
    #${sid}-wv { position: absolute; left: ${960 - WIN / 2}px; top: 953px; width: ${WIN}px; height: 64px; overflow: hidden; z-index: 40; }
    #${sid}-wvs { position: absolute; left: 0; top: 0; }
    #${sid}-wvh { position: absolute; left: ${WIN / 2 - 1}px; top: 0; width: 3px; height: 64px; background: ${PAL.white}; }`;
  const html = `
    <div id="${sid}-wv" data-layout-allow-caption-zone><svg id="${sid}-wvs" width="${total}" height="64" viewBox="0 0 ${total} 64" fill="${PAL.muted}">${rects}</svg><div id="${sid}-wvh"></div></div>`;
  const tl = new Timeline().fromTo(`#${sid}-wvs`, { x: 0 }, { x: -DURATION * PPS, duration: DURATION, ease: "none" }, 0);
  return { css, html, tl };
}
