// pipeline.mp4: the data flow as one horizontal track the camera pans along (power2.inOut):
// Record (a take with its green sync flashes) -> Log (events.json) -> Anchor (storyboard.json,
// "ref": "down:send") -> Build (pointer, camera and caption clips snapped to that one anchor) ->
// Audit (build.mjs --audit: holds, jumps, dead air, claims ok). Type carries it; the one accent
// (key green) marks the anchor's thread from log line to film to the audit's "ok".

import { snap, K } from "../../../film/lib/config.mjs";
import { sceneFile, Timeline } from "../../../film/lib/emit.mjs";
import { pointerMarkup, pointerShow } from "../../../film/lib/pointer.mjs";
import { mockApp } from "../lib/mockapp.mjs";
import { PAL, MONO, SANS, jsonLine, jsonCss } from "../lib/type.mjs";

export const DURATION = 12.5;
const STEP = 1800; // station spacing on the track: a resting frame shows one station, nothing of its neighbours
const SW = [1040, 1240, 1240, 1240, 1240]; // station widths
const SX = (i) => i * STEP + (1920 - SW[i]) / 2; // station left edge (centred when the track is at -i*STEP)
const TOP = 350; // content top
const LH = 56; // code line height

export function build() {
  const id = "pipeline";
  const tl = new Timeline();
  let css = `
    #pl-ground { position: absolute; inset: 0; background: ${PAL.ink}; }
    #pl-track { position: absolute; left: 0; top: 0; width: ${4 * STEP + 1920}px; height: 1080px; }
    .st { position: absolute; top: 0; height: 1080px; }
    .hd { position: absolute; left: 0; top: 190px; display: flex; align-items: baseline; gap: 28px; white-space: nowrap; }
    .hd b { font-family: ${SANS}; font-weight: 800; font-size: 88px; letter-spacing: -0.02em; font-variation-settings: "wdth" 112; color: ${PAL.white}; line-height: 1; }
    .hd span { font-family: ${MONO}; font-size: 32px; color: ${PAL.muted}; }
    .note { position: absolute; left: 0; font-family: ${MONO}; font-size: 28px; color: ${PAL.muted}; white-space: nowrap; }
    ${jsonCss(".st")}
    .st .rf { color: ${PAL.white}; }
    #pl-thread { position: absolute; left: 0; top: 0; overflow: visible; }`;
  let html = `    <div id="pl-ground"></div>
    <div id="pl-track" data-layout-allow-overflow>`;

  // ---------- station 0: Record ----------
  const W0 = 1040, H0 = 585;
  const app = mockApp({ p: "pr", scale: "big", K: W0 / 1440 });
  css += app.css + `
    #pl-win { position: absolute; left: 0; top: ${TOP - 50}px; width: ${W0}px; height: ${H0}px; border-radius: 16px; overflow: hidden; background: #fff; box-shadow: 0 28px 70px rgba(0,0,0,.45); }
    #pl-flash { position: absolute; inset: 0; border-radius: 16px; box-shadow: inset 0 0 0 12px ${PAL.key}; opacity: 0; }`;
  html += `
      <div class="st" id="pl-s0" style="left:${SX(0)}px; width:${SW[0]}px">
        <div class="hd" id="pl-h0"><b>Record</b><span>a Playwright take</span></div>
        <div id="pl-win">${app.html}<div id="pl-flash"></div></div>
        <div class="note" id="pl-n0" style="top:${TOP - 50 + H0 + 26}px">master.mp4 · 1440×810 · 60 fps · no cursor</div>
      </div>`;
  tl.fromTo("#pl-h0", { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.5, ease: "expo.out" }, 0.1);
  tl.fromTo("#pl-win", { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 0.6, ease: "expo.out" }, 0.2);
  for (const at of [0.85, 1.2, 1.55]) {
    tl.set("#pl-flash", { opacity: 1 }, snap(at));
    tl.set("#pl-flash", { opacity: 0 }, snap(at + 0.1));
  }
  tl.fromTo("#pl-n0", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "expo.out" }, 0.9);

  // ---------- station 1: Log (events.json) ----------
  const ev = [
    `"schema": "walkthrough-take/1",`,
    `"events": [`,
    `  { "type": "sync", "label": "start 3", "t": 0.95 },`,
    `  { "type": "move", "label": "send", "t": 4.21, "tEnd": 4.86 },`,
    `  { "type": "down", "label": "send", "t": 5.04 },`,
    `  { "type": "up", "label": "send", "t": 5.13 },`,
    `  { "type": "waitStart", "label": "reply", "t": 5.31 },`,
    `  { "type": "waitEnd", "label": "reply", "t": 61.2 }`,
    `]`,
  ];
  const DOWN = 4; // the down:send line
  css += `
    #pl-hl { position: absolute; left: -22px; top: ${TOP + DOWN * LH - 11}px; width: 1290px; height: 52px; background: ${PAL.plate}; transform-origin: 0 50%; }
    #pl-hlbar { position: absolute; left: -22px; top: ${TOP + DOWN * LH - 11}px; width: 6px; height: 52px; background: ${PAL.key}; }`;
  html += `
      <div class="st" id="pl-s1" style="left:${SX(1)}px; width:${SW[1]}px">
        <div class="hd" id="pl-h1"><b>Log</b><span>events.json</span></div>
        <div id="pl-hl"></div><div id="pl-hlbar"></div>
${ev.map((l, i) => `        <div class="ln" id="pl-e${i}" style="top:${TOP + i * LH}px">${jsonLine(l)}</div>`).join("\n")}
      </div>`;

  // ---------- station 2: Anchor (storyboard.json) ----------
  const sb = [
    `"scenes": [{`,
    `  "camera": [`,
    `    { "at": { "ref": "down:send" }, "box": "down:send" }`,
    `  ],`,
    `  "captions": [`,
    `    { "text": "Send the request", "at": { "ref": "down:send" } }`,
    `  ],`,
    `  "pointer": { "showAt": { "ref": "move:send" } }`,
    `}]`,
  ];
  const counter = { n: 0 };
  html += `
      <div class="st" id="pl-s2" style="left:${SX(2)}px; width:${SW[2]}px">
        <div class="hd" id="pl-h2"><b>Anchor</b><span>storyboard.json</span></div>
${sb.map((l, i) => `        <div class="ln" id="pl-b${i}" style="top:${TOP + i * LH}px">${jsonLine(l, { ref: "down:send", refId: "pl-rf", counter })}</div>`).join("\n")}
        <div class="note" id="pl-n2" style="top:${TOP + sb.length * LH + 30}px">anchors are (type, label) pairs, never seconds</div>
      </div>`;
  const nRefs = counter.n;

  // the thread: from the down:send line in the log to the first anchor in the storyboard
  const x1 = SX(1) + 1270, y1 = TOP + DOWN * LH + 15;
  const x2 = SX(2) - 30, y2 = TOP + 2 * LH + 15;
  const xm = (x1 + x2) / 2;
  const thread = `M ${x1} ${y1} H ${xm} V ${y2} H ${x2}`;
  const tlen = (x2 - x1) + Math.abs(y2 - y1);
  html += `
      <svg id="pl-thread" width="${4 * STEP + 1920}" height="1080" viewBox="0 0 ${4 * STEP + 1920} 1080"><path id="pl-th" d="${thread}" fill="none" stroke="${PAL.key}" stroke-width="4" stroke-dasharray="${tlen}" stroke-dashoffset="${tlen}"/>
        <circle id="pl-thd" cx="${x2}" cy="${y2}" r="8" fill="${PAL.key}" opacity="0"/></svg>`;

  // ---------- station 3: Build (the film's tracks snapped to one anchor) ----------
  const LX = 230, LW = 1010; // lanes x range (station-local)
  const AX = LX + Math.round((5.04 - 4.2) * 2 * ((LW - 3 * 12) / 4 + 12)); // anchor x: t 5.04 on the ruler (frames at 4.2, 4.7, 5.2, 5.7 s)
  const frames = 4, FW = (LW - 3 * 12) / 4, FH = Math.round(FW * 9 / 16);
  const laneY = [TOP + 250, TOP + 350, TOP + 450];
  css += `
    #pl-s3 .rul { position: absolute; top: ${TOP}px; font-family: ${MONO}; font-size: 28px; color: ${PAL.muted}; }
    #pl-s3 .fr { position: absolute; top: ${TOP + 50}px; width: ${FW}px; height: ${FH}px; border-radius: 8px; background: #fff; overflow: hidden; }
    #pl-s3 .fr i { position: absolute; display: block; }
    #pl-s3 .lane { position: absolute; left: ${LX}px; width: ${LW}px; height: 76px; border-bottom: 2px solid ${PAL.line}; }
    #pl-s3 .lbl { position: absolute; left: 0; height: 76px; display: flex; align-items: center; font-family: ${MONO}; font-size: 30px; color: ${PAL.muted}; }
    #pl-s3 .clipb { position: absolute; top: 8px; height: 60px; background: ${PAL.plate}; border-left: 6px solid ${PAL.key}; display: flex; align-items: center; gap: 14px; padding: 0 20px; font-family: ${SANS}; font-size: 30px; font-weight: 700; color: ${PAL.white}; white-space: nowrap; }
    #pl-s3 .ptrbox { position: relative; width: 26px; height: 40px; }
    #pl-anc { position: absolute; left: ${AX - 2}px; top: ${TOP - 52}px; width: 4px; height: ${laneY[2] + 76 - TOP + 52 + 10}px; background: ${PAL.key}; transform-origin: 50% 0; }
    #pl-ancl { position: absolute; left: ${AX + 16}px; top: ${TOP - 56}px; font-family: ${MONO}; font-size: 30px; color: ${PAL.key}; white-space: nowrap; }`;
  const ticks = [0, 1, 2, 3].map((k) => `<div class="rul" id="pl-r${k}" style="left:${LX + k * (FW + 12)}px">${(4.2 + k * 0.5).toFixed(1)}</div>`).join("");
  const frameHtml = Array.from({ length: frames }, (_, k) => {
    const s = FW / 1440;
    const r = (x, y, w, h, c) => `<i style="left:${(x * s).toFixed(1)}px;top:${(y * s).toFixed(1)}px;width:${(w * s).toFixed(1)}px;height:${(h * s).toFixed(1)}px;background:${c}"></i>`;
    const loaded = k < 2;
    return `<div class="fr" id="pl-f${k}" style="left:${LX + k * (FW + 12)}px">${r(0, 0, 260, 810, "#F0F2EF")}${r(308, 168, 1084, 96, "#E3E6E2")}${r(1216, 184, 160, 60, k >= 2 ? "#141414" : "#5A605C")}${[0, 1, 2].map((c) => r(308 + c * 371, 300, 342, 300, loaded ? ["#2F3A34", "#C9CFC6", "#8E9A8C"][c] : "#E3E6E2")).join("")}</div>`;
  }).join("");
  const ptr = pointerMarkup({ id: "pl-ptr", shape: "arrow" });
  css += ptr.css.replace(/position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 30; opacity: 0;/, "position: absolute; left: 2px; top: -5px; width: 0; height: 0; z-index: 30; opacity: 0;");
  html += `
      <div class="st" id="pl-s3" style="left:${SX(3)}px; width:${SW[3]}px">
        <div class="hd" id="pl-h3"><b>Build</b><span>build.mjs</span></div>
        <div id="pl-rul">${ticks}</div>
        <div id="pl-frs">${frameHtml}</div>
        ${["pointer", "camera", "caption"].map((l, k) => `<div class="lbl" id="pl-l${k}" style="top:${laneY[k]}px">${l}</div><div class="lane" id="pl-ln${k}" style="top:${laneY[k]}px"></div>`).join("\n        ")}
        <div id="pl-anc"></div>
        <div id="pl-ancl">down:send</div>
        <div class="clipb" id="pl-c0" style="left:${AX}px; top:${laneY[0] + 8}px"><div class="ptrbox">${ptr.html}</div>click</div>
        <div class="clipb" id="pl-c1" style="left:${AX}px; top:${laneY[1] + 8}px">punch-in 1.7×</div>
        <div class="clipb" id="pl-c2" style="left:${AX}px; top:${laneY[2] + 8}px">Send the request</div>
      </div>`;

  // ---------- station 4: Audit ----------
  const rows = [
    ["holds", "no still stretch over 1.0 s"],
    ["jumps", "no pointer jump over 120 px at a cut"],
    ["dead air", "nothing still after a caption ends"],
    ["claims", "quoted text matches the logged mark"],
  ];
  css += `
    #pl-s4 .cmd { position: absolute; left: 0; top: ${TOP}px; font-family: ${MONO}; font-size: 34px; color: ${PAL.white}; white-space: pre; }
    #pl-s4 .row { position: absolute; left: 0; width: 1240px; height: 88px; border-bottom: 2px solid ${PAL.line}; display: flex; align-items: center; white-space: nowrap; }
    #pl-s4 .k { width: 260px; font-family: ${MONO}; font-size: 34px; font-weight: 700; color: ${PAL.white}; }
    #pl-s4 .d { font-family: ${SANS}; font-size: 32px; color: ${PAL.muted}; }
    #pl-s4 .ok { position: absolute; right: 0; font-family: ${MONO}; font-size: 34px; font-weight: 700; color: ${PAL.key}; }`;
  html += `
      <div class="st" id="pl-s4" style="left:${SX(4)}px; width:${SW[4]}px">
        <div class="hd" id="pl-h4"><b>Audit</b><span>before anyone watches it</span></div>
        <div class="cmd" id="pl-cmd"><span style="color:${PAL.muted}">$ </span>node build.mjs --audit</div>
${rows.map(([k, d], i) => `        <div class="row" id="pl-a${i}" style="top:${TOP + 80 + i * 88}px"><span class="k">${k}</span><span class="d">${d}</span><span class="ok" id="pl-ok${i}">ok</span></div>`).join("\n")}
        <div class="note" id="pl-sum" style="top:${TOP + 80 + rows.length * 88 + 40}px">audit: 0 error(s), 0 warning(s)</div>
      </div>
    </div>`;

  // ---------- motion ----------
  const PAN = [2.2, 4.7, 7.2, 9.2];
  PAN.forEach((at, i) => tl.fromTo("#pl-track", { x: -i * STEP }, { x: -(i + 1) * STEP, duration: 0.85, ease: "power2.inOut" }, at));
  const head = (k, at) => tl.fromTo(`#pl-h${k}`, { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.45, ease: "expo.out" }, at);

  // log: lines land one by one, then the down:send line is lit
  head(1, PAN[0] + 0.35);
  ev.forEach((_, i) => tl.fromTo(`#pl-e${i}`, { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.22, ease: "expo.out" }, snap(PAN[0] + 0.55 + i * 0.1)));
  const lit = snap(PAN[0] + 0.55 + ev.length * 0.1 + 0.15);
  tl.fromTo("#pl-hl", { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: "expo.out" }, lit);
  tl.fromTo("#pl-hlbar", { scaleY: 0 }, { scaleY: 1, duration: 0.3, ease: "expo.out" }, lit);
  ev.forEach((_, i) => { if (i !== DOWN) tl.fromTo(`#pl-e${i}`, { opacity: 1 }, { opacity: 0.45, duration: 0.3, ease: "power2.out" }, lit + 0.05); });

  // the thread draws across the gap while the camera pans to the storyboard
  tl.fromTo("#pl-th", { strokeDashoffset: tlen }, { strokeDashoffset: 0, duration: 0.85, ease: "power2.inOut" }, PAN[1]);
  tl.fromTo("#pl-thd", { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "expo.out" }, PAN[1] + 0.7);
  head(2, PAN[1] + 0.35);
  sb.forEach((_, i) => tl.fromTo(`#pl-b${i}`, { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.22, ease: "expo.out" }, snap(PAN[1] + 0.55 + i * 0.08)));
  const refsAt = snap(PAN[1] + 0.55 + sb.length * 0.08 + 0.1);
  for (let r = 0; r < nRefs; r++) tl.fromTo(`#pl-rf${r}`, { color: PAL.white }, { color: PAL.key, duration: 0.2, ease: "power2.out" }, refsAt + r * 0.18);
  tl.fromTo("#pl-n2", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "expo.out" }, refsAt + 0.5);

  // build: ruler and frames land, the anchor drops, the three clips snap to it
  head(3, PAN[2] + 0.35);
  tl.fromTo("#pl-rul", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "expo.out" }, PAN[2] + 0.45);
  for (let k = 0; k < frames; k++) tl.fromTo(`#pl-f${k}`, { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "expo.out" }, snap(PAN[2] + 0.5 + k * 0.06));
  for (let k = 0; k < 3; k++) {
    tl.fromTo(`#pl-l${k}`, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "expo.out" }, PAN[2] + 0.6 + k * 0.05);
    tl.fromTo(`#pl-ln${k}`, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "expo.out" }, PAN[2] + 0.6 + k * 0.05);
  }
  const drop = snap(PAN[2] + 0.85);
  tl.fromTo("#pl-anc", { scaleY: 0 }, { scaleY: 1, duration: 0.4, ease: "expo.out" }, drop);
  tl.fromTo("#pl-ancl", { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "expo.out" }, drop + 0.05);
  tl.add(pointerShow({ id: "pl-ptr", at: 0 }));
  for (let k = 0; k < 3; k++) tl.fromTo(`#pl-c${k}`, { opacity: 0, x: 140 }, { opacity: 1, x: 0, duration: 0.45, ease: "expo.out" }, snap(drop + 0.3 + k * 0.12));

  // audit: the command, then each check and its ok
  head(4, PAN[3] + 0.35);
  tl.fromTo("#pl-cmd", { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "expo.out" }, PAN[3] + 0.5);
  rows.forEach((_, i) => {
    tl.fromTo(`#pl-a${i}`, { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.25, ease: "expo.out" }, snap(PAN[3] + 0.6 + i * 0.1));
    tl.fromTo(`#pl-ok${i}`, { opacity: 0 }, { opacity: 1, duration: 0.12, ease: "power2.out" }, snap(PAN[3] + 0.9 + i * 0.14));
  });
  tl.fromTo("#pl-sum", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "expo.out" }, snap(PAN[3] + 1.5));

  return {
    duration: DURATION,
    scenes: [{ id, file: sceneFile({ id, duration: DURATION, css, html, tl }) }],
  };
}
