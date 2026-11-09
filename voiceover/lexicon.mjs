#!/usr/bin/env node
// Pronunciation lexicon: list the words text-to-speech may get wrong, and show what is sent.
//
//   node voiceover/lexicon.mjs check <script.json> [--lexicon voiceover/lexicon.json]
//        lists candidates: mixed-case brand-like words (BrightPost), all capitals (SKU, API), digits
//        glued to letters (4K, v2), dotted names (brightpost.app), then words capitalised
//        mid-sentence (names); words the lexicon already covers are left out
//   node voiceover/lexicon.mjs show <script.json> [--lexicon …]
//        every line whose text the lexicon changes, before and after
//
// lexicon.json: { "version": 1, "entries": { "Brightpost": "Bright post" } }. Whole words; matched
// case-sensitively first, then case-insensitively. Applied only to the text sent to TTS (tts.mjs),
// never to captions, script.json or placement.json. Editing an entry regenerates only the lines whose
// sent text changes; bumping "version" regenerates every line (both are in the per-line cache key).
// The lexicon is found as --lexicon, else lexicon.json beside the script.
// Exit 0; `check` exits 3 when there are candidates not in the lexicon (so a wrapper can stop).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyLexicon, lexiconCandidates, loadLexicon } from "./lib/lexicon.mjs";

const args = process.argv.slice(2);
const [sub, scriptArg] = args;
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : null; };
if (!["check", "show"].includes(sub) || !scriptArg || args.includes("--help")) {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  console.log(src.slice(1, src.findIndex((l) => l.startsWith("import "))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n").trim());
  process.exit(args.includes("--help") ? 0 : 1);
}
const scriptPath = resolve(scriptArg);
const lines = JSON.parse(readFileSync(scriptPath, "utf8")).lines;
const lexPath = opt("lexicon") ? resolve(opt("lexicon")) : join(dirname(scriptPath), "lexicon.json");
const lex = loadLexicon(existsSync(lexPath) ? lexPath : null);
console.log(`lexicon: ${lex.file ? `${lex.file} v${lex.version}, ${Object.keys(lex.entries).length} entries` : `none (${lexPath} does not exist)`}`);

if (sub === "show") {
  let n = 0;
  for (const l of lines) {
    const r = applyLexicon(l.text, lex);
    if (!r.hits.length) continue;
    n++;
    console.log(`${l.id}  before: ${l.text}\n${" ".repeat(l.id.length)}  sent:   ${r.text}`);
  }
  console.log(`${n} of ${lines.length} lines changed by the lexicon`);
} else {
  const c = lexiconCandidates(lines, lex);
  if (!c.length) { console.log("no candidates: nothing in the script looks hard to pronounce"); process.exit(0); }
  console.log(`${c.length} candidate(s): listen for these, or add a spelling hint to the lexicon`);
  for (const f of c) console.log(`  ${f.word.padEnd(18)} ${f.why.padEnd(46)} ${f.lines.join(", ")}`);
  console.log(`\nAdd entries like { "version": 1, "entries": { "${c[0].word}": "<how it is said>" } } to ${lexPath}`);
  process.exit(3);
}
