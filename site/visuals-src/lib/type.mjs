// Shared bits for the hand-written motion graphics: palette, mono JSON lines with key/value colour,
// and the slanted caption plate in the film's numbers (16 deg, accent tick).

export const PAL = {
  ink: "#141414",
  plate: "#1F1F1F",
  line: "#2E2E2E",
  cyc: "#E3E6E2",
  white: "#FFFFFF",
  muted: "#A3A8A4",
  key: "#00B140",
};

export const MONO = `"JetBrains Mono", "Source Code Pro", monospace`;
export const SANS = `"Archivo", Helvetica, Arial, sans-serif`;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * jsonLine(text, { refId }) -> html. Keys and punctuation muted, values white. A value equal to
 * `ref` gets an id (refId + running index) so it can be lit in the accent.
 */
export function jsonLine(text, { ref, refId, counter } = {}) {
  let out = "";
  let i = 0;
  const re = /"([^"]*)"(\s*:)?|(-?\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(text))) {
    out += `<span class="pu">${esc(text.slice(i, m.index))}</span>`;
    if (m[1] !== undefined && m[2]) out += `<span class="ky">"${esc(m[1])}"</span><span class="pu">${esc(m[2])}</span>`;
    else if (m[1] !== undefined) {
      if (ref && m[1] === ref) out += `<span class="vl rf" id="${refId}${counter.n++}">"${esc(m[1])}"</span>`;
      else out += `<span class="vl">"${esc(m[1])}"</span>`;
    } else out += `<span class="vl">${esc(m[3])}</span>`;
    i = re.lastIndex;
  }
  out += `<span class="pu">${esc(text.slice(i))}</span>`;
  return out.replace(/ /g, (s) => s); // spaces kept (white-space: pre on the line)
}

export const jsonCss = (scope) => `
    ${scope} .ln { position: absolute; left: 0; white-space: pre; font-family: ${MONO}; font-size: 30px; line-height: 1; }
    ${scope} .ky, ${scope} .pu { color: ${PAL.muted}; }
    ${scope} .vl { color: ${PAL.white}; }`;
