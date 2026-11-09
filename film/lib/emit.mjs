// Emitting static, deterministic scene source: numbers rounded, ids stable, tweens as literal JS.

import { FILM } from "./config.mjs";
import { power3InOut } from "../../recorder/motion.mjs";

/** Round for emitted source (6 decimals: a 1e-4 s rounding of a fast move's start is ~0.1 px). */
export const n = (v) => {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
};

export const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** A raw JS expression inside tween vars (e.g. an ease function name). */
export const raw = (code) => ({ __raw: code });

function lit(v) {
  if (v && typeof v === "object" && "__raw" in v) return v.__raw;
  if (typeof v === "number") return String(n(v));
  if (Array.isArray(v)) return `[${v.map(lit).join(", ")}]`;
  if (v && typeof v === "object")
    return `{ ${Object.entries(v)
      .map(([k, x]) => `${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}: ${lit(x)}`)
      .join(", ")} }`;
  return JSON.stringify(v);
}

/**
 * Collects tween statements for one composition's paused timeline. Only fromTo and set are
 * offered (the HyperFrames contract: fromTo inside scenes, instant sets for hard flips).
 */
export class Timeline {
  constructor() {
    this.items = [];
  }
  fromTo(sel, from, to, at) {
    this.items.push({ kind: "fromTo", sel, from, to, at });
    return this;
  }
  set(sel, vars, at) {
    this.items.push({ kind: "set", sel, vars, at });
    return this;
  }
  comment(text) {
    this.items.push({ kind: "comment", text });
    return this;
  }
  /** Merge another component's statements. */
  add(part) {
    if (!part) return this;
    this.items.push(...(part instanceof Timeline ? part.items : part));
    return this;
  }
  /**
   * Emit. Where several fromTo calls target one selector, every one but the earliest-positioned
   * gets immediateRender: false, so a seek before the first tween keeps the earliest "from" state
   * (GSAP applies fromTo from-values at authoring time otherwise).
   */
  toString() {
    const first = new Map();
    for (const it of this.items)
      if (it.kind === "fromTo" && (!first.has(it.sel) || it.at < first.get(it.sel).at)) first.set(it.sel, it);
    return this.items
      .map((it) => {
        if (it.kind === "comment") return `// ${it.text}`;
        if (it.kind === "set") return `tl.set(${JSON.stringify(it.sel)}, ${lit(it.vars)}, ${n(it.at)});`;
        const to = first.get(it.sel) === it ? it.to : { ...it.to, immediateRender: false };
        return `tl.fromTo(${JSON.stringify(it.sel)}, ${lit(it.from)}, ${lit(to)}, ${n(it.at)});`;
      })
      .join("\n    ");
  }
}

/**
 * Shared helpers every scene script starts with. HF.p3 is the recorder's own ease function
 * (recorder/motion.mjs), embedded verbatim so the drawn pointer follows the real mouse's curve.
 * HF.arcA / HF.arcB split the quadratic arc's sideways bulge into two monotone halves:
 * bulge(t) = 2 P (1 - P) * D with P = HF.p3(t / T), D = control - chord midpoint.
 */
export function prelude() {
  return `const HF = {};
    HF.p3 = ${power3InOut.toString().replace(/^function\s+\w*/, "function ")};
    HF.arcA = (u) => { const p = HF.p3(u / 2); return 4 * p * (1 - p); };
    HF.arcB = (v) => { const p = HF.p3(0.5 + v / 2); return 1 - 4 * p * (1 - p); };`;
}

/**
 * A scene (sub-composition) file. Everything inside <template>; root styled as #root.
 * parts: [{ css, html, tl }] from components, merged in order.
 */
export function sceneFile({ id, duration, css = "", html = "", tl, rootAttrs = "" }) {
  return `<template id="${id}-template">
  <style>
    #root { position: absolute; inset: 0; overflow: hidden; font-family: ${FILM.fontStack}; }
    ${css.trim()}
  </style>
  <div id="root" data-composition-id="${id}" data-start="0" data-duration="${n(duration)}" data-width="${FILM.width}" data-height="${FILM.height}"${rootAttrs ? " " + rootAttrs : ""}>
${html}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    ${prelude()}
    const tl = gsap.timeline({ paused: true });
    ${tl.toString()}
    window.__timelines["${id}"] = tl;
  </script>
</template>
`;
}

/** Merge component parts ({css, html, tl}) into one. */
export function merge(...parts) {
  const tl = new Timeline();
  let css = "";
  let html = "";
  for (const p of parts.flat()) {
    if (!p) continue;
    css += (p.css || "") + "\n";
    html += (p.html || "") + "\n";
    tl.add(p.tl);
  }
  return { css, html, tl };
}
