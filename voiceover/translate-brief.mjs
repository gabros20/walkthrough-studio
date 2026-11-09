#!/usr/bin/env node
// Multi-language twins: a translation brief per line and per caption, then the translated files.
//
//   node voiceover/translate-brief.mjs brief <lang> [--script voiceover/script.json]
//        [--captions captions.srt] [--windows voiceover/windows.json] [--placement voiceover/placement.json]
//        [--out <dir>] [--ui-translated] [--wps 2.6]
//   node voiceover/translate-brief.mjs apply <lang> [same options]
//
// brief writes, in --out (default: the script's folder):
//   script.<lang>.brief.md    per voice line: the English, what is on screen, its window, the most
//                             words and characters that fit, and the claims that must survive
//   captions.<lang>.brief.md  per caption: the English, its time and hold, the most words that fit
//   script.<lang>.answers.json / captions.<lang>.answers.json   blank answer files (only when absent):
//                             { "lang": "de", "lines": { "L01": "" } } and { "lang": "de", "cues": { "1": "" } }
// The translator (an agent) fills the answer files. apply then checks them and writes
//   script.<lang>.json        the script with the translated text (ids, scenes and windows unchanged)
//   captions.<lang>.srt       the captions with the translated text (timings unchanged), beside the
//                             English captions.srt, never in the voiceover folder: the sound build
//                             takes the one .srt beside a voice track as that voice's subtitles
// and runs the fit check: every line's estimated length against its window. Exit 1 when an answer
// is missing, a claim is broken, a caption is too long or a line does not fit.
//
// The fit rule (fitcheck.py's and place.py's): the placed clip (speech + 0.12 s of edges) must end at
// least 0.3 s before the window end once the 0.15 s lead-in is given back, so a line may speak for
// at most window - 0.42 s. The speech is estimated from the English take when placement.json has it:
// the line's measured English duration scaled by max(words, characters) translated / English (an
// unchanged line therefore fits exactly when it fitted in English). Lines without a measurement use
// max(words / wps, characters / cps), with wps and cps measured over the whole English take, else
// --wps (2.6 words a second) and 2.6 x the script's mean characters per word. Windows come from
// windows.json (fitcheck.py) when given or found beside the script, else each line's own window.
// Captions: one line, at most 10 words, at most 60 characters, and a hold of 0.5 s + 0.3 s a word.
// Claims: text in double quotes is UI text and stays verbatim (English) unless --ui-translated;
// numbers written as digits must appear unchanged; names in the lexicon stay as written. Count words
// (two, three, eighteen, once…) are listed in the brief for the translator but not checked.
//
// Then: node voiceover/tts.mjs render --lang <lang> --script <out>/script.<lang>.json --voice <id>
// (a voice that speaks the language; eleven_v4 is multilingual). See docs/VOICE.md, Languages.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadLexicon } from "./lib/lexicon.mjs";

const args = process.argv.slice(2);
const [sub, LANG] = args;
const opt = (name, def = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
if (!["brief", "apply"].includes(sub) || !LANG || flag("help")) {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  console.log(src.slice(1, src.findIndex((l) => l.startsWith("import "))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n").trim());
  process.exit(flag("help") ? 0 : 1);
}
if (!/^[a-z]{2,3}(-[A-Za-z0-9]+)?$/.test(LANG) || LANG === "en") { console.error(`error: language code "${LANG}" (a code like de, fr, pt-BR; not en)`); process.exit(1); }
const die = (m) => { console.error(`error: ${m}`); process.exit(1); };
const rel = (p) => { const r = relative(process.cwd(), p); return !r ? p : r.startsWith("..") ? p : r; };
const r2 = (x) => Math.round(x * 100) / 100;

const scriptPath = resolve(opt("script", "voiceover/script.json"));
if (!existsSync(scriptPath)) die(`no script at ${rel(scriptPath)} (pass --script)`);
const SDIR = dirname(scriptPath);
const OUT = resolve(opt("out") ?? SDIR);
mkdirSync(OUT, { recursive: true });
const script = JSON.parse(readFileSync(scriptPath, "utf8"));
const capPath = [opt("captions"), "captions.srt", join(SDIR, "..", "captions.srt")].filter(Boolean).map((p) => resolve(p)).find(existsSync) ?? null;
const winPath = [opt("windows"), join(SDIR, "windows.json")].filter(Boolean).map((p) => resolve(p)).find(existsSync) ?? null;
const plPath = [opt("placement"), join(SDIR, "placement.json")].filter(Boolean).map((p) => resolve(p)).find(existsSync) ?? null;
const lex = loadLexicon([join(SDIR, "lexicon.json")].find(existsSync));
const uiTranslated = flag("ui-translated");

// ---- the English voice: words and characters a second ----
const words = (t) => (t.match(/\S+/g) || []).length;
const chars = (t) => t.trim().length;
const allText = script.lines.map((l) => l.text);
let wps = +opt("wps", 2.6), cps = wps * (allText.join(" ").length / Math.max(1, allText.reduce((s, t) => s + words(t), 0))), rateFrom = `default ${wps} words/s`;
const measured = {};
if (plPath) {
  const pl = JSON.parse(readFileSync(plPath, "utf8")).lines ?? [];
  let w = 0, c = 0, s = 0;
  for (const p of pl) {
    const d = p.speechEnd - p.speechStart;
    if (!(d > 0)) continue;
    measured[p.key] = r2(d); w += words(p.text); c += chars(p.text); s += d;
  }
  if (s > 0) { wps = w / s; cps = c / s; rateFrom = `measured on the English take (${rel(plPath)}): ${wps.toFixed(2)} words/s, ${cps.toFixed(1)} characters/s`; }
}
const EDGES = 0.12, MIN_SLACK = 0.3; // clip = speech + 40 ms before + 80 ms after; slack after the lead-in is given back
const windows = {};
const wj = winPath ? JSON.parse(readFileSync(winPath, "utf8")) : null;
for (const l of script.lines) {
  const w = wj?.windows?.[l.id] ?? (l.window ? [l.window.start, l.window.end] : null);
  if (!w) die(`no window for ${l.id} (script.json or windows.json)`);
  windows[l.id] = w;
}
const enOf = Object.fromEntries(script.lines.map((l) => [l.id, l.text]));
/** Seconds of speech a line may have in its window. */
const budget = (id) => Math.max(0, windows[id][1] - windows[id][0] - MIN_SLACK - EDGES);
/** Estimated seconds of speech for text t on line id. */
const estimate = (id, t) => {
  const en = enOf[id];
  if (measured[id] != null) return measured[id] * Math.max(words(t) / words(en), chars(t) / chars(en));
  return Math.max(words(t) / wps, chars(t) / cps);
};
/** Most words / characters that fit line id. */
const limits = (id) => {
  const b = budget(id), en = enOf[id];
  if (measured[id] != null) { const k = b / measured[id]; return [Math.floor(words(en) * k), Math.floor(chars(en) * k)]; }
  return [Math.floor(b * wps), Math.floor(b * cps)];
};

// ---- claims that must survive translation ----
const quoted = (t) => [...t.matchAll(/[“"]([^”"]+)[”"]/g)].map((m) => m[1]);
const digits = (t) => t.match(/\d+(?:[.,:]\d+)*/g) || [];
const NUMWORDS = ["zero", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty", "thirty", "forty", "fifty", "hundred", "thousand", "once", "twice"];
const numberWords = (t) => (t.toLowerCase().match(/[a-z]+/g) || []).filter((w) => NUMWORDS.includes(w));
const names = (t) => Object.keys(lex.entries).filter((k) => new RegExp(`(^|[^\\p{L}])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "iu").test(t));
const claimsOf = (t) => {
  const out = [];
  for (const q of quoted(t)) out.push(uiTranslated ? `"${q}" is UI text: use the app's ${LANG} label` : `"${q}" is UI text: keep it verbatim, in English, in quotes`);
  for (const d of digits(t)) out.push(`the number ${d} stays ${d}`);
  for (const n of numberWords(t)) out.push(`"${n}" is a count: keep the same value`);
  for (const n of names(t)) out.push(`${n} (in the lexicon) is a name or term: keep it as written`);
  return out;
};

// ---- captions ----
const parseSrt = (txt) => txt.replace(/\r/g, "").trim().split(/\n\s*\n/).map((b) => {
  const ls = b.split("\n"); const m = ls[1]?.match(/(\S+)\s*-->\s*(\S+)/);
  const sec = (s) => { const [h, mi, rest] = s.split(":"); const [se, ms] = rest.split(/[,.]/); return +h * 3600 + +mi * 60 + +se + +ms / 1000; };
  return m ? { n: ls[0].trim(), from: m[1], to: m[2], start: sec(m[1]), end: sec(m[2]), text: ls.slice(2).join(" ").trim() } : null;
}).filter(Boolean);
const cues = capPath ? parseSrt(readFileSync(capPath, "utf8")) : [];
const CAP_WORDS = 10, CAP_CHARS = 60;
const capMaxWords = (c) => Math.max(1, Math.min(CAP_WORDS, Math.floor((c.end - c.start - 0.5) / 0.3 + 1e-9)));

const F = (name) => join(OUT, name.replace("<lang>", LANG));
if (sub === "brief") brief(); else apply();

function brief() {
  const L = [];
  L.push(`# Voiceover translation brief: ${LANG}`, "",
    `Source: ${rel(scriptPath)} (${script.lines.length} lines). Write the ${LANG} text of every line into \`${rel(F("script.<lang>.answers.json"))}\` (\`{ "lang": "${LANG}", "lines": { "L01": "..." } }\`), then run \`node voiceover/translate-brief.mjs apply ${LANG}\`.`, "",
    "How to write it:", "",
    "- Write for the ear, as the English does: short sentences, plain words, no hype. Say the same thing, not a word-for-word copy.",
    "- Stay inside the limits below. The voice speaks at the English take's pace; a line over the limit will not fit its window and the picture does not move for it.",
    "- Say nothing the English does not say: every claim is checked against the film.",
    `- ${uiTranslated ? `The app's UI is shown in ${LANG}: UI text in quotes becomes the app's own ${LANG} label.` : "The app's UI stays in English on screen: UI text in quotes stays verbatim in English."}`, "",
    `Pace: ${rateFrom}. A line may speak for its window minus ${MIN_SLACK + EDGES} s; the limits scale the English line's own measured length (or the pace above when it has none). Stay under both.`, "",
    "| id | scene | window (s) | English | on screen | EN said in | max words | max chars | keep |", "|---|---|---|---|---|---|---|---|---|");
  for (const l of script.lines) {
    const w = windows[l.id], [mw, mc] = limits(l.id);
    L.push(`| ${l.id} | ${l.scene ?? ""} | ${w[0].toFixed(2)}-${w[1].toFixed(2)} (${(w[1] - w[0]).toFixed(1)}) | ${l.text.replace(/\|/g, "\\|")} | ${(l.onScreen ?? "").replace(/\|/g, "\\|")} | ${measured[l.id] != null ? `${measured[l.id].toFixed(2)} s` : "-"} | ${mw} | ${mc} | ${claimsOf(l.text).join("; ").replace(/\|/g, "\\|") || "-"} |`);
  }
  writeFileSync(F("script.<lang>.brief.md"), L.join("\n") + "\n");
  if (!existsSync(F("script.<lang>.answers.json"))) writeFileSync(F("script.<lang>.answers.json"), JSON.stringify({ lang: LANG, lines: Object.fromEntries(script.lines.map((l) => [l.id, ""])) }, null, 1) + "\n");
  const wrote = [F("script.<lang>.brief.md"), F("script.<lang>.answers.json")];
  if (cues.length) {
    const C = [`# Caption translation brief: ${LANG}`, "",
      `Source: ${rel(capPath)} (${cues.length} captions). Write the ${LANG} text of every caption into \`${rel(F("captions.<lang>.answers.json"))}\` (\`{ "lang": "${LANG}", "cues": { "1": "..." } }\`). Timings stay as they are.`, "",
      `Each caption is one line on screen: at most ${CAP_WORDS} words and ${CAP_CHARS} characters, and no more words than its hold allows (0.5 s + 0.3 s a word). Same claims rule as the voice: quoted UI text ${uiTranslated ? "becomes the app's label" : "stays verbatim in English"}, digits stay, names stay.`, "",
      "| # | time | hold (s) | English | max words | keep |", "|---|---|---|---|---|---|"];
    for (const c of cues) C.push(`| ${c.n} | ${c.from.slice(3, 8)}-${c.to.slice(3, 8)} | ${(c.end - c.start).toFixed(1)} | ${c.text.replace(/\|/g, "\\|")} | ${capMaxWords(c)} | ${claimsOf(c.text).join("; ").replace(/\|/g, "\\|") || "-"} |`);
    writeFileSync(F("captions.<lang>.brief.md"), C.join("\n") + "\n");
    if (!existsSync(F("captions.<lang>.answers.json"))) writeFileSync(F("captions.<lang>.answers.json"), JSON.stringify({ lang: LANG, cues: Object.fromEntries(cues.map((c) => [c.n, ""])) }, null, 1) + "\n");
    wrote.push(F("captions.<lang>.brief.md"), F("captions.<lang>.answers.json"));
  } else console.log(`no captions.srt found (pass --captions): caption brief skipped`);
  console.log(`pace: ${rateFrom}; windows: ${winPath ? rel(winPath) : "the script's"}`);
  console.log(`wrote ${wrote.map(rel).join(", ")}`);
}

function checkClaims(en, tr, where, errs) {
  if (!uiTranslated) for (const q of quoted(en)) if (!tr.includes(q)) errs.push(`${where}: UI text "${q}" is not in the translation verbatim`);
  for (const d of digits(en)) if (!digits(tr).includes(d)) errs.push(`${where}: the number ${d} is missing`);
  for (const n of names(en)) if (!new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(tr)) errs.push(`${where}: the name ${n} is missing`);
}

function apply() {
  const errs = [];
  const ansPath = F("script.<lang>.answers.json");
  if (!existsSync(ansPath)) die(`no answers at ${rel(ansPath)} (run brief first, then fill it)`);
  const ans = JSON.parse(readFileSync(ansPath, "utf8")).lines ?? {};
  const out = structuredClone(script);
  out.lang = LANG; out.translatedFrom = rel(scriptPath);
  out.estimateRule = `English line's measured speech x max(words, chars) ratio, else max(words/${wps.toFixed(2)}, chars/${cps.toFixed(1)}) (${rateFrom}); speech <= window - ${MIN_SLACK + EDGES} s`;
  console.log(`fit check (${LANG}), ${rateFrom}`);
  console.log(`${"id".padEnd(4)} ${"window".padStart(15)} ${"len".padStart(5)} ${"words".padStart(5)} ${"chars".padStart(5)} ${"est".padStart(5)} ${"max".padStart(5)} ${"slack".padStart(6)}`);
  for (const l of out.lines) {
    const tr = (ans[l.id] ?? "").trim();
    if (!tr) { errs.push(`${l.id}: no translation`); continue; }
    checkClaims(l.text, tr, l.id, errs);
    const w = windows[l.id], len = w[1] - w[0], est = estimate(l.id, tr), b = budget(l.id);
    l.source = l.text; l.text = tr; l.words = words(tr); l.estDuration = r2(est); l.fillOfWindow = Math.round((est / len) * 1000) / 1000;
    const bad = est > b + 0.005;
    if (bad) errs.push(`${l.id}: needs about ${est.toFixed(2)} s of speech, its ${len.toFixed(2)} s window allows ${b.toFixed(2)} s: shorten by about ${Math.ceil((est - b) * wps)} word(s)`);
    console.log(`${l.id.padEnd(4)} ${w[0].toFixed(2).padStart(7)}-${w[1].toFixed(2).padStart(7)} ${len.toFixed(2).padStart(5)} ${String(l.words).padStart(5)} ${String(chars(tr)).padStart(5)} ${est.toFixed(2).padStart(5)} ${b.toFixed(2).padStart(5)} ${(b - est >= 0 ? "+" : "") + (b - est).toFixed(2).padStart(5)} ${bad ? "DOES NOT FIT" : ""}`);
  }
  const est = out.lines.reduce((s, l) => s + (l.estDuration || 0), 0);
  out.totals = { lines: out.lines.length, words: out.lines.reduce((s, l) => s + (l.words || 0), 0), estSpeech: r2(est) };
  const wrote = [];
  if (!errs.length) { writeFileSync(F("script.<lang>.json"), JSON.stringify(out, null, 2) + "\n"); wrote.push(F("script.<lang>.json")); }

  if (cues.length) {
    const capAns = F("captions.<lang>.answers.json");
    if (!existsSync(capAns)) errs.push(`no caption answers at ${rel(capAns)}`);
    else {
      const ca = JSON.parse(readFileSync(capAns, "utf8")).cues ?? {};
      let srt = "";
      for (const c of cues) {
        const tr = (ca[c.n] ?? "").trim();
        if (!tr) { errs.push(`caption ${c.n}: no translation`); continue; }
        checkClaims(c.text, tr, `caption ${c.n}`, errs);
        if (words(tr) > capMaxWords(c)) errs.push(`caption ${c.n}: ${words(tr)} words, its ${(c.end - c.start).toFixed(1)} s hold allows ${capMaxWords(c)}`);
        if (chars(tr) > CAP_CHARS) errs.push(`caption ${c.n}: ${chars(tr)} characters (max ${CAP_CHARS}, one line)`);
        srt += `${c.n}\n${c.from} --> ${c.to}\n${tr}\n\n`;
      }
      const capOut = join(dirname(capPath), `captions.${LANG}.srt`);
      if (!errs.some((e) => e.startsWith("caption"))) { writeFileSync(capOut, srt); wrote.push(capOut); }
    }
  }
  for (const e of errs) console.log(`!! ${e}`);
  console.log(errs.length ? `${errs.length} problem(s)${wrote.length ? `; wrote ${wrote.map(rel).join(", ")}` : "; nothing written for the part with problems"}` : `ALL FIT; wrote ${wrote.map(rel).join(", ")}`);
  process.exit(errs.length ? 1 : 0);
}
