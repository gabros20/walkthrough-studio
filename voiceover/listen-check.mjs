#!/usr/bin/env node
// Listening proxy: what a machine can measure about a voiceover mix. Measured, not heard: it does not
// replace the person who listens (voiceover/README.md, Listening checks).
//
//   node voiceover/listen-check.mjs <mix.mp4 | mix.wav | vo-track.wav> --script voiceover/script.json
//        [--placement placement.json] [--vo vo-track.wav] [--bed bed.wav] [--out listen-check.json]
//        [--transcript words.json] [--language de] [--engine auto|parakeet|whisper] [--model small.en]
//
// 1. Words: transcribes the audio with `npx --yes hyperframes@0.9.16 transcribe <audio> --json`
//    (word timestamps, saved as <out>.words.json; --transcript takes an existing [{text, start, end}]
//    file instead). The whole script is aligned to everything heard by word sequence (whisper's word
//    times drift by up to a second, so time alone mis-assigns words at line edges); each line gets
//    its word error rate, the script words not heard, the heard words not in the script, and the
//    times its words were heard at. Words are lower-cased, hyphens split, digits 0-20 read as words.
//    An extra word more than 1.5 s from every placed line is listed as heard outside the lines.
//    A non-English script (its "lang", or --language) is transcribed in that language with the
//    multilingual whisper model "small" unless --model says otherwise. When transcription is
//    unavailable the report says so and the other checks still run.
// 2. Voice over music, per line, over its speech span, K-weighted and gated as the sound build
//    measures (sound/lib/audio.mjs):
//    - a mix plus --vo: the voice in the mix is estimated as the voice stem times its best-fit gain
//      (least squares over the line), the rest of the mix is everything else (music and effects);
//    - --vo plus --bed: the two stems as given, before mixing (the bed unducked, so the ratio is lower
//      than in the mix).
//    A line under 8 dB (the sound build's own floor) is flagged.
// 3. Clipping: ffmpeg astats on the file (peak level), and every run of samples at or over -0.1 dBFS
//    with its time.
// Writes listen-check.json (--out; default beside the audio) and prints a table.
// Exit: 0 nothing found, 2 something to listen to (a line with missing or wrong words, a low ratio,
// clipping), 1 bad input.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as A from "../sound/lib/audio.mjs";

const args = process.argv.slice(2);
const opt = (name, def = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
const input = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : null;
if (!input || flag("help")) {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  console.log(src.slice(1, src.findIndex((l) => l.startsWith("import "))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n").trim());
  process.exit(flag("help") ? 0 : 1);
}
const die = (m) => { console.error(`error: ${m}`); process.exit(1); };
const rel = (p) => { const r = relative(process.cwd(), p); return !r ? p : r.startsWith("..") ? p : r; };
const r2 = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : null);
const SR = A.SR;
const MIN_RATIO = 8;
if (!existsSync(input)) die(`no file ${input}`);
const scriptPath = resolve(opt("script", "voiceover/script.json"));
if (!existsSync(scriptPath)) die(`no script at ${rel(scriptPath)} (pass --script)`);
const script = JSON.parse(readFileSync(scriptPath, "utf8"));
const lang = opt("language") ?? script.lang ?? "en";
const voPath = opt("vo") ? resolve(opt("vo")) : null;
const bedPath = opt("bed") ? resolve(opt("bed")) : null;
const SDIR = dirname(scriptPath);
const plPath = [opt("placement"), lang !== "en" && join(SDIR, lang, "placement.json"), voPath && join(dirname(voPath), "placement.json"), join(dirname(input), "placement.json"), join(SDIR, "placement.json")]
  .filter(Boolean).map((p) => resolve(p)).find(existsSync) ?? null;
const placement = plPath ? JSON.parse(readFileSync(plPath, "utf8")).lines : null;
const outPath = resolve(opt("out") ?? join(dirname(input), "listen-check.json"));

// ---------------- 1. words ----------------
const NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const tokens = (t) => t.toLowerCase().replace(/[’']/g, "").split(/[\s\-–—/]+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, "")).filter(Boolean).map((w) => (/^\d+$/.test(w) && +w <= 20 ? NUM[+w] : w));

function transcribe() {
  if (opt("transcript")) {
    const j = JSON.parse(readFileSync(resolve(opt("transcript")), "utf8"));
    return { ok: true, engine: "given", note: rel(resolve(opt("transcript"))), words: Array.isArray(j) ? j : j.words ?? [] };
  }
  const dir = mkdtempSync(join(tmpdir(), "listen-"));
  const a = ["--yes", "hyperframes@0.9.16", "transcribe", input, "--json", "--dir", dir];
  if (opt("engine")) a.push("--engine", opt("engine"));
  const model = opt("model") ?? (lang !== "en" ? "small" : null);
  if (model) a.push("--model", model);
  if (lang !== "en") a.push("--language", lang);
  console.log(`› npx ${a.join(" ")}`);
  const r = spawnSync("npx", a, { encoding: "utf8", maxBuffer: 1 << 28, timeout: 30 * 60 * 1000 });
  let summary = null;
  for (const line of (r.stdout || "").split("\n").reverse()) { try { const j = JSON.parse(line); if (j && "ok" in j) { summary = j; break; } } catch {} }
  const tp = summary?.transcriptPath ?? join(dir, "transcript.json");
  if (r.status !== 0 || !existsSync(tp)) {
    const why = (r.error?.message || r.stderr || "").trim().split("\n").filter(Boolean).slice(-2).join(" / ").slice(0, 300);
    return { ok: false, engine: null, note: `transcribe unavailable (exit ${r.status}): ${why || "no transcript written"}`, words: [] };
  }
  const j = JSON.parse(readFileSync(tp, "utf8"));
  return { ok: true, engine: summary?.engine ?? "?", model: summary?.model ?? model, note: "", words: Array.isArray(j) ? j : j.words ?? [] };
}

/** Levenshtein alignment of reference and heard tokens: { errors, ops: [[op, refIndex, heardIndex]] }. */
function align(r, h) {
  const n = r.length, m = h.length;
  const d = Array.from({ length: n + 1 }, (_, i) => Int32Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  const ops = [];
  let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1)) { ops.push([r[i - 1] === h[j - 1] ? "eq" : "sub", i - 1, j - 1]); i--; j--; }
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) { ops.push(["del", i - 1, null]); i--; }
    else { ops.push(["ins", null, j - 1]); j--; }
  }
  return { errors: d[n][m], ops: ops.reverse() };
}

const T = transcribe();
console.log(T.ok ? `transcript: ${T.words.length} words (${T.engine}${T.model ? `, ${T.model}` : ""})` : T.note);
if (T.ok && !opt("transcript")) writeFileSync(outPath.replace(/\.json$/, "") + ".words.json", JSON.stringify(T.words) + "\n");
// Lines are matched by word sequence, not by time: whisper's word times drift by up to a second
// (the first word of a take is often stamped at 0). The whole script is aligned to everything heard;
// each heard word belongs to the script word it aligns with, an extra word to the line before it,
// unless it lies more than 1.5 s from every placed line (then it is "outside").
const byKey = Object.fromEntries((placement ?? []).map((p) => [p.key, p]));
const lines = script.lines.map((l) => ({ key: l.id, text: l.text, start: byKey[l.id]?.speechStart ?? byKey[l.id]?.start ?? null, end: byKey[l.id]?.speechEnd ?? byKey[l.id]?.end ?? null }));
if (placement) for (const l of lines) if (l.start == null) console.log(`!! ${l.key} is in the script but not in ${rel(plPath)}`);
const ref = lines.flatMap((l, li) => tokens(l.text).map((t) => ({ t, li })));
const hyp = T.words.flatMap((w) => tokens(String(w.text)).map((t) => ({ t, start: w.start, end: w.end })));
const per = lines.map(() => ({ errors: 0, missing: [], extra: [], heard: [] }));
const outside = [];
const farFromLines = (h) => placement && lines.every((l) => l.start == null || Math.min(Math.abs((h.start + h.end) / 2 - l.start), Math.abs((h.start + h.end) / 2 - l.end)) > 1.5 && !((h.start + h.end) / 2 >= l.start && (h.start + h.end) / 2 <= l.end));
let filmWer = null;
if (T.ok) {
  const { errors, ops } = align(ref.map((x) => x.t), hyp.map((x) => x.t));
  filmWer = r2(errors / Math.max(1, ref.length));
  let lastLi = 0;
  for (const [op, i, j] of ops) {
    if (op === "ins") {
      const h = hyp[j];
      if (farFromLines(h)) { outside.push({ t: r2(h.start), text: h.t }); continue; }
      per[lastLi].extra.push(h.t); per[lastLi].heard.push(h); per[lastLi].errors++;
      continue;
    }
    const li = ref[i].li; lastLi = li;
    if (op === "del") { per[li].missing.push(ref[i].t); per[li].errors++; continue; }
    per[li].heard.push(hyp[j]);
    if (op === "sub") { per[li].missing.push(ref[i].t); per[li].extra.push(hyp[j].t); per[li].errors++; }
  }
}
const rows = lines.map((l, li) => {
  const p = per[li], n = Math.max(1, tokens(l.text).length);
  const hs = p.heard.map((h) => h.start).filter(Number.isFinite), he = p.heard.map((h) => h.end).filter(Number.isFinite);
  return { key: l.key, start: r2(l.start), end: r2(l.end), text: l.text, heard: T.ok ? p.heard.map((h) => h.t).join(" ") : null, heardAt: T.ok && hs.length ? [r2(Math.min(...hs)), r2(Math.max(...he))] : null, wer: T.ok ? r2(p.errors / n) : null, missing: T.ok ? p.missing : null, extra: T.ok ? p.extra : null };
});

// ---------------- 2. voice over music ----------------
let ratioMethod = null;
if (placement && voPath) {
  const V = A.decode(voPath);
  let voice = null, rest = null;
  if (resolve(input) !== voPath) {
    ratioMethod = "in the mix: the voice estimated as the voice stem x its best-fit gain per line, the rest is everything else";
    const M = A.decode(input);
    const n = Math.min(A.len(M), A.len(V));
    voice = A.alloc(n); rest = A.alloc(n);
    for (let i = 0; i < n; i++) { rest.L[i] = M.L[i]; rest.R[i] = M.R[i]; }
    for (const [k, l] of lines.entries()) {
      if (l.start == null) continue;
      const a = Math.max(0, Math.round((l.start - 0.05) * SR)), b = Math.min(n, Math.round((l.end + 0.1) * SR));
      let mv = 0, vv = 0;
      for (let i = a; i < b; i++) { mv += M.L[i] * V.L[i] + M.R[i] * V.R[i]; vv += V.L[i] * V.L[i] + V.R[i] * V.R[i]; }
      const g = vv > 0 ? mv / vv : 0;
      rows[k].voiceGainDb = r2(20 * Math.log10(Math.abs(g) + 1e-12));
      for (let i = a; i < b; i++) { voice.L[i] = g * V.L[i]; voice.R[i] = g * V.R[i]; rest.L[i] = M.L[i] - voice.L[i]; rest.R[i] = M.R[i] - voice.R[i]; }
    }
  } else if (bedPath) {
    ratioMethod = "stems before mixing (--vo, --bed; the bed unducked)";
    voice = V; rest = A.decode(bedPath);
  }
  if (voice) {
    const vk = A.kweight(voice), rk = A.kweight(rest);
    for (const [k, l] of lines.entries()) {
      if (l.start == null) continue;
      const v = A.gatedLevelK(vk, l.start, l.end), m = A.levelK(rk, l.start, l.end);
      Object.assign(rows[k], { voiceLufs: r2(v), restLufs: r2(m), voiceOverMusicDb: r2(v - m) });
    }
  }
}
if (!ratioMethod) ratioMethod = !voPath ? "not measured (pass --vo, with a mix or with --bed)" : !placement ? "no placement.json: no per-line ratio" : "the voice track alone: no music to compare (pass --bed)";

// ---------------- 3. clipping ----------------
const st = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", input, "-map", "0:a:0", "-af", "astats=metadata=0", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 28 });
const overall = st.stderr.slice(st.stderr.lastIndexOf("Overall"));
const peakDb = parseFloat((overall.match(/Peak level dB:\s*(-?[\d.inf]+)/) || [])[1]);
const X = A.decode(input);
const thr = Math.pow(10, -0.1 / 20);
const events = [];
let over = 0;
for (let i = 0; i < A.len(X); i++) {
  if (Math.abs(X.L[i]) >= thr || Math.abs(X.R[i]) >= thr) {
    over++;
    const t = i / SR, e = events.at(-1);
    if (e && t - e.to <= 0.01) { e.to = t; e.samples++; } else events.push({ from: t, to: t, samples: 1 });
  }
}
const clipping = { peakDb: r2(peakDb), samplesAtOrOverMinus0_1dBFS: over, runs: events.length, first: events.slice(0, 10).map((e) => ({ from: r2(e.from), to: r2(e.to), samples: e.samples })) };

// ---------------- report ----------------
const findings = [];
for (const r of rows) {
  if (r.wer != null && (r.missing.length || r.wer > 0)) findings.push(`${r.key}: WER ${r.wer}${r.missing.length ? `, not heard: ${r.missing.join(" ")}` : ""}${r.extra.length ? `, heard instead/extra: ${r.extra.join(" ")}` : ""}`);
  if (r.voiceOverMusicDb != null && r.voiceOverMusicDb < MIN_RATIO) findings.push(`${r.key}: voice only ${r.voiceOverMusicDb} dB over the music`);
}
if (!T.ok) findings.push(`words not checked: ${T.note}`);
if (outside.length) findings.push(`${outside.length} word(s) heard outside every line: ${outside.slice(0, 8).map((w) => `${w.t}s "${w.text}"`).join(", ")}`);
if (over) findings.push(`clipping: ${over} sample(s) at or over -0.1 dBFS in ${events.length} run(s), first at ${r2(events[0].from)} s`);
const report = {
  note: "measured, not heard: a person still listens before it ships",
  at: new Date().toISOString(), input: rel(input), script: rel(scriptPath), placement: plPath && rel(plPath), language: lang,
  transcribe: { ok: T.ok, engine: T.engine, model: T.model ?? null, note: T.note, words: T.words.length },
  filmWer, ratioMethod, minVoiceOverMusicDb: MIN_RATIO,
  lines: rows, outside, clipping, findings,
};
writeFileSync(outPath, JSON.stringify(report, null, 1) + "\n");

console.log(`\nlisten check (measured, not heard): ${rel(input)}${placement ? "" : " (no placement.json: per-line results skipped)"}`);
console.log(`${"line".padEnd(5)} ${"time".padStart(13)} ${"WER".padStart(5)} ${"VO/mus".padStart(7)}  missing / extra`);
for (const r of rows) console.log(`${r.key.padEnd(5)} ${(r.start == null ? "-" : `${r.start.toFixed(2)}-${r.end.toFixed(2)}`).padStart(13)} ${r.wer == null ? "  -  " : r.wer.toFixed(2).padStart(5)} ${r.voiceOverMusicDb == null ? "    -  " : `${r.voiceOverMusicDb.toFixed(1)} dB`.padStart(7)}  ${r.missing?.length ? `-[${r.missing.join(" ")}]` : ""}${r.extra?.length ? ` +[${r.extra.join(" ")}]` : ""}`);
console.log(`film WER ${filmWer ?? "-"}; ratio: ${ratioMethod}; peak ${r2(peakDb)} dBFS, ${over} sample(s) at or over -0.1 dBFS`);
console.log(findings.length ? `${findings.length} finding(s) to listen to:\n  ${findings.join("\n  ")}` : "nothing found (still: listen to it)");
console.log(`wrote ${rel(outPath)}`);
process.exit(findings.length ? 2 : 0);
