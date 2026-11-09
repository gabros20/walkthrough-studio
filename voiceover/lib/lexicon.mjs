// Pronunciation lexicon: spelling hints applied to the text sent to text-to-speech, never to captions
// or to placement.json's text.
//
// lexicon.json: { "version": 1, "entries": { "Brightpost": "Bright post", "SKU": "S K U" } }
// Matching is whole-word. Every entry is first matched case-sensitively; what is left is then matched
// case-insensitively, so "Brightpost" and "BRIGHTPOST" both become "Bright post". Longer keys win
// over shorter ones, and replaced text is never matched again. The text after the lexicon is part of
// the per-line cache key, so editing an entry regenerates exactly the lines it changes. "version" is
// in the key too: bump it only to force every line to be generated again.
import { existsSync, readFileSync } from "node:fs";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// a word boundary that also keeps dotted names whole (brightpost.app is not "Brightpost" + ".app")
const B = "(?<![\\p{L}\\p{N}_]|[\\p{L}\\p{N}]\\.)", E = "(?![\\p{L}\\p{N}_]|\\.[\\p{L}\\p{N}])";

export function loadLexicon(file) {
  if (!file || !existsSync(file)) return { version: 0, entries: {}, file: null };
  const j = JSON.parse(readFileSync(file, "utf8"));
  const entries = j.entries ?? Object.fromEntries(Object.entries(j).filter(([k, v]) => k !== "version" && typeof v === "string"));
  return { version: j.version ?? 1, entries, file };
}

/** Apply the lexicon; returns { text, hits: [[from, to], ...] }. */
export function applyLexicon(text, lex) {
  const keys = Object.keys(lex.entries || {}).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!keys.length) return { text, hits: [] };
  const hits = [], slots = [];
  const hold = (from, to) => { hits.push([from, to]); slots.push(to); return `\u0000${slots.length - 1}\u0000`; };
  const alt = keys.map(esc).join("|");
  let t = text.replace(new RegExp(`${B}(${alt})${E}`, "gu"), (m) => hold(m, lex.entries[m]));
  const lower = Object.fromEntries(keys.map((k) => [k.toLowerCase(), k]));
  t = t.replace(new RegExp(`${B}(${alt})${E}`, "giu"), (m) => hold(m, lex.entries[lower[m.toLowerCase()]]));
  t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[+i]);
  return { text: t, hits };
}

/**
 * Words likely to be mispronounced: brand-like CamelCase (Brightpost is not, BrightPost is), all-caps
 * of two or more letters, digits glued to letters (4K, v2, 3D), and words the lexicon already covers
 * are left out. Returns [{ word, why, lines: [ids] }].
 */
export function lexiconCandidates(lines, lex = { entries: {} }) {
  const known = new Set(Object.keys(lex.entries || {}).map((k) => k.toLowerCase()));
  const found = new Map();
  const add = (w, why, id) => {
    if (known.has(w.toLowerCase())) return;
    const f = found.get(w) ?? { word: w, why, lines: [] };
    if (!f.lines.includes(id)) f.lines.push(id);
    found.set(w, f);
  };
  for (const l of lines) {
    for (const m of l.text.matchAll(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*[\p{L}\p{N}]|[\p{L}\p{N}]/gu)) {
      const bare = m[0].replace(/['’]s$/, "");
      const sentenceStart = /^\s*$|[.!?:;"“]\s*$/u.test(l.text.slice(0, m.index));
      if (/\p{N}/u.test(bare) && /\p{L}/u.test(bare)) add(bare, "digits and letters together", l.id);
      else if (/^\p{Lu}{2,}$/u.test(bare.replace(/[.-]/g, ""))) add(bare, "all capitals (a word, or letter by letter?)", l.id);
      else if (/\p{Ll}\p{Lu}/u.test(bare) || /^\p{Lu}{2,}\p{Ll}/u.test(bare)) add(bare, "mixed case, brand-like", l.id);
      else if (/\p{L}\.\p{L}/u.test(bare)) add(bare, "dotted name or domain", l.id);
      else if (/^\p{Lu}\p{Ll}/u.test(bare) && !sentenceStart) add(bare, "capitalised mid-sentence: a name?", l.id);
    }
  }
  const rank = (f) => (f.why.startsWith("capitalised") ? 1 : 0);
  return [...found.values()].sort((a, b) => rank(a) - rank(b));
}
