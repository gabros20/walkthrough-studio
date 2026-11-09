// audit.mp4: the audit catching a frozen hold and the hold being trimmed. A stretch of the film's
// timeline (28-44 s, scenes b and c) as a thumbnail strip; a scan head sweeps it, stops being
// innocent at a 2.4 s stretch where nothing moves (identical frames, hatched), the audit prints the
// warning, the hold is trimmed to 0.4 s and the rest of the film closes up; a re-run says ok.

import { snap } from "../../../film/lib/config.mjs";
import { n, sceneFile, Timeline } from "../../../film/lib/emit.mjs";
import { PAL, MONO, SANS } from "../lib/type.mjs";

export const DURATION = 8;
const T0 = 28, T1 = 44; // film seconds shown
const X0 = 140, X1 = 1780, PPS = (X1 - X0) / (T1 - T0); // 102.5 px a second
const X = (t) => X0 + (t - T0) * PPS;
const HOLD = { from: 34.4, to: 36.8, keep: 0.4 };
const CUT = (HOLD.to - HOLD.from - HOLD.keep) * PPS; // px the rest of the film moves left
const SY = 480, SH = 110; // strip
const FW = Math.round(SH * 16 / 9); // thumbnail width

function thumb(state) {
  // a tiny frame of the mock app, no text: sidebar, composer, button, three cards
  const s = FW / 1440;
  const r = (x, y, w, h, c) => `<i style="left:${n(x * s)}px;top:${n(y * s)}px;width:${n(w * s)}px;height:${n(h * s)}px;background:${c}"></i>`;
  const tones = ["#2F3A34", "#C9CFC6", "#8E9A8C"];
  if (state === "settings")
    return r(0, 0, 260, 810, "#F0F2EF") + r(308, 120, 400, 60, "#141414") + [0, 1, 2].map((k) => r(308, 240 + k * 120, 1084, 4, "#D3D7D2") + r(1300, 190 + k * 120, 92, 50, k < 2 ? "#141414" : "#D3D7D2")).join("");
  const loaded = state; // number of loaded cards
  return r(0, 0, 260, 810, "#F0F2EF") + r(308, 168, 1084, 96, "#E3E6E2") + r(1216, 184, 160, 60, "#141414") + [0, 1, 2].map((c) => r(308 + c * 371, 300, 342, 300, c < loaded ? tones[c] : "#E3E6E2") + r(308 + c * 371, 630, 200, 28, c < loaded ? "#141414" : "#E3E6E2")).join("");
}

export function build() {
  const id = "audit";
  const tl = new Timeline();
  const nThumbs = Math.ceil((X1 - X0) / FW) + 2;
  // frame states along the strip: cards load, then the frozen stretch (all identical), then settings
  const holdA = X(HOLD.from), holdB = X(HOLD.to);
  const stateAt = (x) => (x + FW / 2 < holdA ? Math.min(3, Math.floor((x - X0) / FW)) : x < holdB ? 3 : "settings");
  // two halves: everything left of the hold's end (clipped on trim) and everything after (slides left)
  let left = "", right = "";
  for (let k = 0; k < nThumbs; k++) {
    const x = X0 + k * FW;
    const state = stateAt(x);
    const cell = `<div class="au-fr" style="left:${n(x - X0)}px">${thumb(state)}</div>`;
    if (x < holdB) left += cell;
    if (x + FW > holdB) right += cell.replace(`left:${n(x - X0)}px`, `left:${n(x - holdB)}px`);
  }

  const css = `
    #au-ground { position: absolute; inset: 0; background: ${PAL.ink}; }
    .au-hd { position: absolute; left: ${X0}px; top: 200px; display: flex; align-items: baseline; gap: 28px; white-space: nowrap; }
    .au-hd b { font-family: ${SANS}; font-weight: 800; font-size: 88px; letter-spacing: -0.02em; font-variation-settings: "wdth" 112; color: ${PAL.white}; line-height: 1; }
    .au-hd span { font-family: ${MONO}; font-size: 32px; color: ${PAL.muted}; }
    .au-rul { position: absolute; top: ${SY - 54}px; font-family: ${MONO}; font-size: 28px; color: ${PAL.muted}; transform: translateX(-50%); }
    .au-tick { position: absolute; top: ${SY - 14}px; width: 2px; height: 10px; background: ${PAL.line}; }
    #au-len { position: absolute; right: ${1920 - X1}px; top: 216px; font-family: ${MONO}; font-size: 32px; color: ${PAL.white}; white-space: nowrap; }
    #au-len2 { position: absolute; right: ${1920 - X1}px; top: 216px; font-family: ${MONO}; font-size: 32px; color: ${PAL.white}; white-space: nowrap; }
    .au-half { position: absolute; top: ${SY}px; height: ${SH}px; overflow: hidden; }
    #au-l { left: ${X0}px; width: ${n(holdB - X0)}px; }
    #au-r { left: ${n(holdB)}px; width: ${n(X1 - holdB + CUT)}px; }
    .au-fr { position: absolute; top: 0; width: ${FW - 4}px; height: ${SH}px; border-radius: 6px; background: #fff; overflow: hidden; }
    .au-fr i { position: absolute; display: block; }
    #au-hold { position: absolute; left: ${n(holdA)}px; top: ${SY - 6}px; width: ${n(holdB - holdA)}px; height: ${SH + 12}px; transform-origin: 0 50%; }
    #au-hatch { position: absolute; inset: 0; background: repeating-linear-gradient(-45deg, rgba(20,20,20,0.55) 0 10px, rgba(20,20,20,0) 10px 22px); }
    #au-ring { position: absolute; inset: 0; border: 4px solid ${PAL.white}; border-radius: 8px; }
    #au-hl { position: absolute; left: ${n(holdA)}px; top: ${SY + SH + 22}px; font-family: ${MONO}; font-size: 28px; color: ${PAL.white}; white-space: nowrap; }
    #au-seam { position: absolute; left: ${n(holdA + HOLD.keep * PPS - 2)}px; top: ${SY - 18}px; width: 6px; height: ${SH + 36}px; background: ${PAL.key}; transform-origin: 50% 50%; }
    #au-seaml { position: absolute; left: ${n(holdA + HOLD.keep * PPS + 18)}px; top: ${SY + SH + 22}px; font-family: ${MONO}; font-size: 28px; color: ${PAL.key}; white-space: nowrap; }
    #au-scan { position: absolute; left: ${X0}px; top: ${SY - 30}px; width: 3px; height: ${SH + 60}px; margin-left: -1px; background: ${PAL.white}; }
    .au-out { position: absolute; left: ${X0}px; font-family: ${MONO}; font-size: 30px; white-space: pre; color: ${PAL.muted}; }
    .au-out b { color: ${PAL.white}; font-weight: 700; }
    .au-out .g { color: ${PAL.key}; font-weight: 700; }
    #au-strike { position: absolute; left: ${X0}px; top: 0; height: 3px; background: ${PAL.muted}; transform-origin: 0 50%; }`;

  const ticks = [];
  for (let t = T0; t <= T1; t += 2) ticks.push(t);
  const OUT = 730;
  const WARN = "warn  holds     b 34.40  2.4 s still: no pointer move, no tween, no UI change";
  const html = `    <div id="au-ground"></div>
    <div class="au-hd" id="au-hd"><b>Audit</b><span>build.mjs --audit</span></div>
    <div id="au-len" data-layout-allow-overlap>film 61.4 s</div>
    <div id="au-len2" data-layout-allow-overlap>film 59.4 s</div>
    <div id="au-rul">${ticks.map((t) => `<div class="au-rul" style="left:${n(X(t))}px">${t}</div><div class="au-tick" style="left:${n(X(t) - 1)}px"></div>`).join("")}</div>
    <div class="au-half" id="au-l">${left}</div>
    <div class="au-half" id="au-r"><div id="au-rin" style="position:absolute;left:0;top:0;width:100%;height:100%">${right}</div></div>
    <div id="au-hold"><div id="au-hatch"></div><div id="au-ring"></div></div>
    <div id="au-hl">2.4 s still</div>
    <div id="au-seam"></div>
    <div id="au-seaml">trimmed to 0.4 s</div>
    <div id="au-scan"></div>
    <div class="au-out" id="au-o0" style="top:${OUT}px"><b>warn</b>${WARN.slice(4)}</div>
    <div id="au-strike" style="top:${OUT + 17}px; width:${n(30 * 0.6 * WARN.length)}px"></div>
    <div class="au-out" id="au-o1" style="top:${OUT + 60}px"><span class="g">ok</span>    holds     nothing still over 1.0 s</div>
    <div class="au-out" id="au-o2" style="top:${OUT + 130}px">audit: 0 error(s), 0 warning(s)</div>`;

  // the strip is on screen from the first frame (it loops on the page); the scan starts at once
  tl.set("#au-r", { x: 0, clipPath: `inset(0px ${n(CUT)}px 0px 0px)` }, 0);

  // scan 1: catches the hold at its end
  const s1 = 0.5, s1end = 2.5;
  const catchAt = snap(s1 + ((holdB - X0) / (X1 - X0)) * (s1end - s1));
  tl.fromTo("#au-scan", { opacity: 0 }, { opacity: 1, duration: 0.1, ease: "power2.out" }, s1);
  tl.fromTo("#au-scan", { x: 0 }, { x: X1 - X0, duration: s1end - s1, ease: "none" }, s1);
  tl.fromTo("#au-scan", { opacity: 1 }, { opacity: 0, duration: 0.1, ease: "power3.in" }, s1end - 0.1);
  tl.fromTo("#au-hatch", { opacity: 0 }, { opacity: 1, duration: 0.25, ease: "power2.out" }, catchAt);
  tl.fromTo("#au-ring", { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.35, ease: "expo.out" }, catchAt);
  tl.fromTo("#au-hl", { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.25, ease: "expo.out" }, catchAt + 0.05);
  tl.fromTo("#au-o0", { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "expo.out" }, catchAt + 0.25);

  // trim: the hold shrinks to 0.4 s, the rest of the film closes up
  const trim = snap(catchAt + 1.5), td = 0.6;
  tl.fromTo("#au-hl", { opacity: 1 }, { opacity: 0, duration: 0.15, ease: "power3.in" }, trim - 0.1);
  tl.fromTo("#au-hold", { scaleX: 1 }, { scaleX: (HOLD.keep * PPS) / (holdB - holdA), duration: td, ease: "power2.inOut" }, trim);
  tl.fromTo("#au-hold", { opacity: 1 }, { opacity: 0, duration: 0.2, ease: "power3.in" }, trim + td);
  tl.fromTo("#au-l", { clipPath: "inset(0px 0px 0px 0px)" }, { clipPath: `inset(0px ${n(CUT)}px 0px 0px)`, duration: td, ease: "power2.inOut" }, trim);
  tl.fromTo("#au-r", { x: 0, clipPath: `inset(0px ${n(CUT)}px 0px 0px)` }, { x: -CUT, clipPath: "inset(0px 0px 0px 0px)", duration: td, ease: "power2.inOut" }, trim);
  tl.fromTo("#au-seam", { scaleY: 0 }, { scaleY: 1, duration: 0.3, ease: "expo.out" }, trim + td - 0.05);
  tl.fromTo("#au-seaml", { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "expo.out" }, trim + td);
  tl.fromTo("#au-len", { opacity: 1 }, { opacity: 0, duration: 0.15, ease: "power3.in" }, trim + td - 0.1);
  tl.fromTo("#au-len2", { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "expo.out" }, trim + td);
  tl.fromTo("#au-strike", { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: "expo.out" }, trim + td);
  tl.fromTo("#au-o0", { opacity: 1 }, { opacity: 0.4, duration: 0.3, ease: "power2.out" }, trim + td);

  // scan 2: clean
  const s2 = snap(trim + td + 0.45), s2end = snap(s2 + 1.1);
  tl.fromTo("#au-scan", { opacity: 0 }, { opacity: 1, duration: 0.1, ease: "power2.out" }, s2);
  tl.fromTo("#au-scan", { x: 0 }, { x: X1 - X0, duration: s2end - s2, ease: "none" }, s2);
  tl.fromTo("#au-scan", { opacity: 1 }, { opacity: 0, duration: 0.1, ease: "power3.in" }, s2end - 0.1);
  tl.fromTo("#au-o1", { opacity: 0, filter: "blur(6px)" }, { opacity: 1, filter: "blur(0px)", duration: 0.3, ease: "expo.out" }, s2end);
  tl.fromTo("#au-o2", { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "expo.out" }, s2end + 0.3);

  return { duration: DURATION, scenes: [{ id, file: sceneFile({ id, duration: DURATION, css, html, tl }) }] };
}
