#!/usr/bin/env node
// Per-line text-to-speech with a cache, and the assembly of the lines into a film-length voice track.
//
//   node voiceover/tts.mjs render --script voiceover/script.json --voice <voice_id>
//        [--model eleven_v4] [--lang en] [--out voiceover] [--lexicon <file>] [--format mp3_44100_128]
//        [--no-assemble] [assemble options]
//   node voiceover/tts.mjs assemble --script voiceover/script.json [--out voiceover] [--lang en]
//        [--windows windows.json] [--film <s> | --cues cues.json [--edl edl.json]]
//        [--gap 0.6] [--start 0.5] [--tail 1.0] [--name <film>] [--dry]
//
// render: one ElevenLabs request per line (POST /v1/text-to-speech/{voice_id}, body { text, model_id },
// key from ELEVENLABS_API_KEY, never printed). The text sent is the line after the pronunciation
// lexicon. Each answer is cached by sha256(voice|model|lexicon version|format|text sent) in
// <out>/cache/<hash>.mp3, so a line is only generated again when its words, the voice, the model or
// the lexicon change; every line prints hit or miss. The line files are <out>/lines/<nn>.mp3
// (01, 02, … in script order), with lines/manifest.json saying which text each one holds. Characters
// sent are appended to <out>/cost.jsonl as { at, kind: "tts", units, note } (the walkthrough CLI folds
// that into state.json). Then it assembles (below) unless --no-assemble.
//   Without a key: the cache hits are still used, every miss gets <out>/lines/<nn>.txt (the exact text
//   to speak) and the connector steps are printed with the file names to drop the audio in as; run
//   `assemble` once they are there (it caches the dropped-in files, so the next render hits).
//   ELEVENLABS_MOCK=1 (or =say on macOS) runs without network or credits: see lib/elevenlabs.mjs. A mock
//   run says so in a banner, keys its cache by the mock mode too (and ELEVENLABS_MOCK_FILE's sha256)
//   and keeps it in <out>/cache-mock/, so a real run never finds mock audio; lines/manifest.json
//   carries "mock": "<mode>" (a real run treats those line files as stale, never as dropped-in audio),
//   and its cost.jsonl rows carry "mock": true, which the walkthrough CLI does not fold into state.json.
//
// assemble: measures every line file (speech found by its 10 ms RMS envelope: 12 dB over the
// 10th-percentile floor, at least -60 dB, at most 30 dB under the loudest 10 ms; a clip runs 40 ms
// before the speech to 80 ms after it, 10 ms fade in, 40 ms fade out) and places it on the film clock:
//   - with windows (windows.json from fitcheck.py, else each script line's own "window"): speech onset
//     at window start + 0.15 s, giving back up to 0.15 s of lead-in when the line is short of 0.3 s
//     slack, then moving earlier inside its scene; what still overruns is printed (place.py's rule);
//   - without windows (a voice-first script): the first line's speech at --start, each next one at the
//     previous clip's end + --gap.
// Writes <out>/vo-track.wav (film length, 48 kHz, 24-bit mono, silent between lines), placement.json
// (the format voiceover/place.py writes, so sound/build-sound.mjs --voiceover reads it unchanged) and
// voiceover.srt (one cue per line). A script line's "anchor" (an event ref, or { ref, offset, edge }) is
// copied onto its placement line, so `film/build.mjs --fit-audio` can match a voice-first line to its
// moment without hand-added anchors. Film length: windows.json "film", else --cues duration, else
// --film, else the last line's end + --tail. --dry prints the placement only.
//
// --lang de (any code but en) keeps the twin apart: its lines, track, placement and srt go to
// <out>/de/; the cache and cost.jsonl stay shared in <out>/. The lexicon is --lexicon, else
// <out>/lexicon.<lang>.json, else <out>/lexicon.json when they exist.
// Exit: 0 done, 1 bad input or a failed request, 2 lines still to generate (connector route).
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { appendCost, hasKey, mockMode, postAudio, saveAudio } from "./lib/elevenlabs.mjs";
import { applyLexicon, loadLexicon } from "./lib/lexicon.mjs";
import * as A from "../sound/lib/audio.mjs";

const args = process.argv.slice(2);
const sub = args[0];
const opt = (name, def = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
if (!sub || flag("help") || !["render", "assemble"].includes(sub)) {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  console.log(src.slice(1, src.findIndex((l) => l.startsWith("import "))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n").trim());
  process.exit(sub && !flag("help") ? 1 : 0);
}
const die = (m) => { console.error(`error: ${m}`); process.exit(1); };
const rel = (p) => { const r = relative(process.cwd(), p); return !r ? p : r.startsWith("..") ? p : r; };
const r3 = (x) => Math.round(x * 1000) / 1000;

const SR = A.SR;
const FADE_IN = 0.010, FADE_OUT = 0.040, LEAD = 0.15, MIN_SLACK = 0.3;
const OUT = resolve(opt("out", "voiceover"));
const LANG = opt("lang", "en");
const DIR = LANG === "en" ? OUT : join(OUT, LANG);
const LINES = join(DIR, "lines");
const MOCK = mockMode(); // "" for real speech
const cacheDir = (mock) => join(OUT, mock ? "cache-mock" : "cache");
const CACHE = cacheDir(MOCK);
const banner = (text) => { const bar = "=".repeat(Math.min(100, text.length)); console.log(`${bar}\n${text}\n${bar}`); };
// what a mock answers depends on the mode, and on the stand-in file's contents when one is given
const mockKey = () => {
  if (!MOCK) return "";
  const f = process.env.ELEVENLABS_MOCK_FILE;
  return `|mock=${MOCK}${f ? `:${existsSync(f) ? createHash("sha256").update(readFileSync(f)).digest("hex").slice(0, 16) : "missing"}` : ""}`;
};
const scriptPath = resolve(opt("script") ?? (existsSync(join(DIR, "script.json")) ? join(DIR, "script.json") : join(OUT, "script.json")));
if (!existsSync(scriptPath)) die(`no script at ${rel(scriptPath)} (pass --script)`);
const script = JSON.parse(readFileSync(scriptPath, "utf8"));
const lines = script.lines ?? die("script.json has no lines");
const pad = Math.max(2, String(lines.length).length);
const nnOf = (i) => String(i + 1).padStart(pad, "0");
const manifestPath = join(LINES, "manifest.json");
const readManifest = () => (existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null);

if (sub === "render") await render();
else assemble();

async function render() {
  const voice = opt("voice") ?? process.env.ELEVENLABS_VOICE_ID;
  if (!voice) die("--voice <voice_id> is required (from GET /v2/voices or the connector's creative_list_voices; never guessed)");
  const model = opt("model", "eleven_v4");
  const format = opt("format", "mp3_44100_128");
  if (!/^mp3_/.test(format)) die("--format must be an mp3_* output format (the cache stores .mp3)");
  const lexPath = opt("lexicon") ? resolve(opt("lexicon")) : [join(OUT, `lexicon.${LANG}.json`), join(OUT, "lexicon.json")].find(existsSync);
  const lex = loadLexicon(lexPath);
  if (MOCK) banner(`MOCK (ELEVENLABS_MOCK=${MOCK}): NOT REAL SPEECH. Stand-in audio (${process.env.ELEVENLABS_MOCK_FILE ? "ELEVENLABS_MOCK_FILE" : MOCK === "say" ? "macOS say" : "tones"}), cached apart in ${rel(CACHE)}/; nothing is sent and no cost reaches state.json.`);
  mkdirSync(LINES, { recursive: true });
  mkdirSync(CACHE, { recursive: true });
  const old = readManifest();
  const oldCache = cacheDir(old?.mock ?? "");
  const MOCK_KEY = mockKey();
  const oldBy = Object.fromEntries((old?.lines ?? []).map((l) => [l.nn, l]));
  const canCall = hasKey() || Boolean(MOCK);
  console.log(`script ${rel(scriptPath)}: ${lines.length} lines, voice ${voice}, model ${model}, ${LANG}, lexicon ${lex.file ? `${rel(lex.file)} v${lex.version} (${Object.keys(lex.entries).length} entries)` : "none"}`);
  console.log(canCall ? (MOCK ? `ELEVENLABS_MOCK=${MOCK}: requests are printed, nothing is sent` : "ELEVENLABS_API_KEY set: misses are generated") : "no ELEVENLABS_API_KEY: misses are listed for the connector route");
  const out = [], todo = [];
  let units = 0, hits = 0, made = 0;
  for (const [i, l] of lines.entries()) {
    const nn = nnOf(i);
    const { text: ttsText, hits: lexHits } = applyLexicon(l.text, lex);
    const hash = createHash("sha256").update(`${voice}|${model}|${lex.version}|${format}|${ttsText}${MOCK_KEY}`).digest("hex").slice(0, 32);
    const mp3 = join(LINES, `${nn}.mp3`), txt = join(LINES, `${nn}.txt`), cached = join(CACHE, `${hash}.mp3`);
    const prev = oldBy[nn];
    if (existsSync(mp3) && prev && prev.hash !== hash) { // the line changed (or real <-> mock): keep the old audio in its own cache, clear the slot
      if (prev.hash && !existsSync(join(oldCache, `${prev.hash}.mp3`))) { mkdirSync(oldCache, { recursive: true }); copyFileSync(mp3, join(oldCache, `${prev.hash}.mp3`)); }
      rmSync(mp3);
    }
    const lexNote = lexHits.length ? `  [lexicon: ${lexHits.map(([a, b]) => `${a} -> ${b}`).join(", ")}]` : "";
    let state;
    if (existsSync(cached)) {
      copyFileSync(cached, mp3); hits++; state = "hit ";
    } else if (existsSync(mp3) && prev?.hash === hash) { // dropped in for this very text: cache it
      copyFileSync(mp3, cached); hits++; state = "hit (dropped-in file)";
    } else if (canCall) {
      try {
        const bytes = await postAudio(`/v1/text-to-speech/${encodeURIComponent(voice)}`, { output_format: format }, { text: ttsText, model_id: model }, { kind: "tts" });
        const d = saveAudio(cached, bytes);
        copyFileSync(cached, mp3); units += ttsText.length; made++; state = `miss -> generated ${d.toFixed(2)} s`;
      } catch (e) {
        console.error(`${nn} ${l.id} FAILED: ${e.message}`);
        if (units) appendCost(join(OUT, "cost.jsonl"), { kind: "tts", units, note: `${made} line(s) generated before a failure, voice ${voice}, model ${model}${MOCK ? " [mock]" : ""}`, ...(MOCK ? { mock: true } : {}) });
        process.exit(1);
      }
    } else {
      writeFileSync(txt, ttsText + "\n"); todo.push({ nn, id: l.id, txt, mp3, ttsText }); state = "miss -> to generate";
    }
    if (state !== "miss -> to generate" && existsSync(txt)) rmSync(txt);
    console.log(`${nn} ${l.id.padEnd(4)} ${state.padEnd(24)} ${JSON.stringify(l.text).slice(0, 70)}${lexNote}`);
    out.push({ nn, id: l.id, hash, text: l.text, ttsText, file: `${nn}.mp3` });
  }
  writeFileSync(manifestPath, JSON.stringify({ voice, model, format, lang: LANG, ...(MOCK ? { mock: MOCK } : {}), script: rel(scriptPath), lexicon: { file: lex.file && rel(lex.file), version: lex.version }, lines: out }, null, 1) + "\n");
  console.log(`${hits} cached, ${made} generated (${units} characters), ${todo.length} to generate`);
  if (units) appendCost(join(OUT, "cost.jsonl"), { kind: "tts", units, note: `${made} of ${lines.length} lines generated, voice ${voice}, model ${model}, ${LANG}${MOCK ? " [mock]" : ""}`, ...(MOCK ? { mock: true } : {}) });
  if (todo.length) {
    const kit = rel(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
    console.log(`
Connector route (ElevenLabs connector; each call charges, so one call per line and never a re-call to compare):
  1. creative_create_flow once; pass its flow_id to every call below.
  2. Per line: creative_generate_speech with voice_id "${voice}", model "${model}", text = the .txt file's
     contents exactly (the lexicon is already applied).
  3. Poll creative_get_flow_run_status until all_completed; pick one variation and download it at once
     to the .mp3 name given (curl -L -o <name> "<result url>").
  4. node ${kit}/voiceover/tts.mjs assemble --script ${rel(scriptPath)}${OUT !== resolve("voiceover") ? ` --out ${rel(OUT)}` : ""}${LANG !== "en" ? ` --lang ${LANG}` : ""}
Lines to generate:`);
    for (const t of todo) console.log(`  ${t.nn} ${t.id.padEnd(4)} ${rel(t.txt)} -> ${rel(t.mp3)}   ${JSON.stringify(t.ttsText).slice(0, 60)}`);
    process.exit(2);
  }
  if (!flag("no-assemble")) assemble();
}

function scenesOf(edl, total) {
  const out = {};
  for (const s of edl.scenes) out[s.id] = [s.start, r3(s.start + s.duration)];
  out.title = [0, edl.scenes[0].start];
  out.end = [Math.max(...Object.values(out).map((v) => v[1])), total];
  return out;
}

function speechSpan(file) {
  const buf = A.decode(file);
  const x = A.mono(buf, 0, A.len(buf));
  const hop = Math.round(0.010 * SR), m = Math.floor(x.length / hop);
  const env = new Float64Array(m);
  for (let i = 0; i < m; i++) { let s = 0; for (let j = i * hop; j < (i + 1) * hop; j++) s += x[j] * x[j]; env[i] = 10 * Math.log10(s / hop + 1e-12); }
  // place.py's rule (12 dB over the 10th-percentile floor, at least -55 dB) assumes a long take with
  // plenty of silence; a single line is mostly speech, so the threshold is also capped 30 dB under the
  // loudest 10 ms (and may go down to -60 dB on a clean digital-silence floor)
  const floor = [...env].sort((a, b) => a - b)[Math.floor(m * 0.1)];
  const thr = Math.min(Math.max(floor + 12, -60), Math.max(...env) - 30);
  let a = -1, b = -1;
  for (let i = 0; i < m; i++) if (env[i] > thr) { if (a < 0) a = i; b = i; }
  const dur = x.length / SR;
  if (a < 0) return { x, dur, sp: [0, dur], silent: true };
  return { x, dur, sp: [a * hop / SR, (b + 1) * hop / SR], silent: false };
}

function writeWav24(path, track) {
  const n = track.length, data = Buffer.alloc(n * 3);
  for (let i = 0; i < n; i++) data.writeIntLE(Math.round(Math.max(-1, Math.min(1, track[i])) * 8388607), 3 * i, 3);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 3, 28); h.writeUInt16LE(3, 32); h.writeUInt16LE(24, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}

function assemble() {
  const dry = flag("dry");
  const man = readManifest();
  // the line files' own cache: a mock render's manifest says so (whatever ELEVENLABS_MOCK is now)
  const manCache = cacheDir(man?.mock ?? "");
  if (man?.mock) banner(`MOCK line files (lines/manifest.json "mock": "${man.mock}"): this voice track is NOT REAL SPEECH; render without ELEVENLABS_MOCK for the real voice.`);
  // line files; dropped-in files (connector route) go into the cache under the manifest's hash
  const missing = [], clips = [];
  for (const [i, l] of lines.entries()) {
    const nn = nnOf(i), mp3 = join(LINES, `${nn}.mp3`);
    const m = man?.lines?.find((x) => x.nn === nn);
    if (m && m.id !== l.id) die(`lines/manifest.json does not match ${rel(scriptPath)} (line ${nn} is ${m.id}, the script says ${l.id}): run render again`);
    if (m && m.text !== l.text) die(`line ${nn} ${l.id} changed since render (manifest: ${JSON.stringify(m.text)}): run render again`);
    if (!existsSync(mp3)) { missing.push(`${nn} ${l.id} ${rel(mp3)}`); continue; }
    if (m?.hash && !existsSync(join(manCache, `${m.hash}.mp3`))) { mkdirSync(manCache, { recursive: true }); copyFileSync(mp3, join(manCache, `${m.hash}.mp3`)); console.log(`${nn} ${l.id}: dropped-in file cached`); }
    clips.push({ i, l, nn, mp3, ...speechSpan(mp3) });
  }
  if (missing.length) die(`${missing.length} line file(s) missing (generate them, see render):\n  ${missing.join("\n  ")}`);

  // the clock: windows.json, else the script's windows, else sequential
  const winPath = opt("windows") ? resolve(opt("windows")) : [join(DIR, "windows.json"), join(OUT, "windows.json")].find(existsSync);
  let FILM = null, SCENES = null, mode;
  const win = {};
  if (winPath) {
    const wj = JSON.parse(readFileSync(winPath, "utf8"));
    FILM = wj.film != null ? +wj.film : null; SCENES = wj.scenes ?? null;
    for (const l of lines) win[l.id] = wj.windows?.[l.id] ?? (l.window ? [l.window.start, l.window.end] : null);
    mode = `windows from ${rel(winPath)}`;
  } else if (lines.every((l) => l.window)) {
    for (const l of lines) win[l.id] = [l.window.start, l.window.end];
    mode = "the script's windows";
  } else mode = "sequential (no windows)";
  if (opt("cues")) {
    const cues = JSON.parse(readFileSync(resolve(opt("cues")), "utf8"));
    FILM ??= +cues.duration;
    if (!SCENES && opt("edl")) SCENES = scenesOf(JSON.parse(readFileSync(resolve(opt("edl")), "utf8")), FILM);
  }
  if (FILM == null && opt("film")) FILM = +opt("film");
  const windowed = mode !== "sequential (no windows)";
  if (windowed && lines.some((l) => !win[l.id])) die(`no window for ${lines.filter((l) => !win[l.id]).map((l) => l.id).join(", ")}`);

  const placed = [];
  let prevEnd = null;
  const gap = +opt("gap", 0.6), start0 = +opt("start", 0.5);
  for (const c of clips) {
    const { l, sp, dur } = c;
    const srcS = Math.max(0, sp[0] - 0.04), srcE = Math.min(dur, sp[1] + 0.08);
    const onset = sp[0] - srcS, len = srcE - srcS;
    let fs, fe, ws, we, note = c.silent ? "no speech found in the file (placed whole); " : "";
    if (windowed) {
      [ws, we] = win[l.id];
      fs = ws - onset + LEAD; fe = fs + len;
      if (we - fe < MIN_SLACK - 0.005) { const back = Math.min(LEAD, MIN_SLACK - (we - fe)); fs -= back; fe -= back; note += `lead-in cut to ${(LEAD - back).toFixed(2)}s; `; }
      if (fe > we) {
        const sc0 = SCENES?.[l.scene]?.[0] ?? 0;
        const earliest = Math.max(sc0, (placed.at(-1)?.end ?? 0) + MIN_SLACK);
        const ns = Math.max(fs - (fe - we), earliest);
        if (ns < fs) { note = `shifted ${(fs - ns).toFixed(2)}s earlier`; fe -= fs - ns; fs = ns; }
        if (fe > we) note += ` OVERRUNS window end by ${(fe - we).toFixed(2)}s`;
      }
    } else {
      fs = prevEnd == null ? start0 - onset : prevEnd + gap; fe = fs + len; ws = r3(fs); we = r3(fe); prevEnd = fe;
    }
    placed.push({
      id: c.i + 1, key: l.id, scene: l.scene ?? null, text: l.text,
      start: r3(fs), end: r3(fe), speechStart: r3(fs + onset), speechEnd: r3(fs + (sp[1] - srcS)),
      sourceStart: r3(srcS), sourceEnd: r3(srcE), windowStart: ws, windowEnd: we, slack: r3(we - fe),
      estDuration: l.estDuration ?? r3((l.text.match(/\S+/g) || []).length / 2.4 + 0.35), measuredDuration: r3(len), note: note.trim().replace(/;$/, ""),
      // a script line's anchor rides along, so `film/build.mjs --fit-audio` can match a voice-first line to its moment
      ...(l.anchor != null ? { anchor: l.anchor } : {}),
      _x: c.x,
    });
  }
  if (FILM == null) {
    FILM = r3(Math.max(...placed.map((p) => Math.max(p.end, p.windowEnd))) + +opt("tail", 1.0));
    console.log(`film length not given (windows.json, --cues or --film): using ${FILM} s`);
  }
  console.log(`placing ${placed.length} lines by ${mode}; film ${FILM.toFixed(3)} s`);
  for (const p of placed) console.log(`${p.key} ${String(p.scene).padEnd(5)} film ${p.start.toFixed(3).padStart(7)}-${p.end.toFixed(3).padStart(7)} win ${p.windowStart.toFixed(2).padStart(6)}-${p.windowEnd.toFixed(2).padStart(6)} slack ${p.slack >= 0 ? "+" : ""}${p.slack.toFixed(2)} dur ${p.measuredDuration.toFixed(2)} (est ${(+p.estDuration).toFixed(2)}) ${p.note}`);
  const problems = [];
  for (const [a, b] of placed.slice(0, -1).map((p, i) => [p, placed[i + 1]])) if (b.start < a.end + MIN_SLACK) problems.push(`close/overlap ${a.key} ${b.key} ${r3(b.start - a.end)} s`);
  for (const p of placed) if (/OVERRUNS/.test(p.note)) problems.push(`${p.key} overruns its window`);
  for (const p of placed) if (p.end > FILM) problems.push(`${p.key} ends at ${p.end} s, after the film (${FILM} s)`);
  for (const m of problems) console.log(`!! ${m}`);
  const speech = placed.reduce((s, p) => s + p.end - p.start, 0);
  console.log(`voice on ${speech.toFixed(1)} s = ${(100 * speech / FILM).toFixed(1)}% of the film`);
  if (dry) return;

  const track = new Float64Array(Math.round(FILM * SR));
  for (const p of placed) {
    const a = Math.round(p.sourceStart * SR), b = Math.round(p.sourceEnd * SR);
    const seg = Float64Array.from(p._x.subarray(a, b));
    const fi = Math.round(FADE_IN * SR), fo = Math.round(FADE_OUT * SR);
    for (let k = 0; k < fi && k < seg.length; k++) seg[k] *= k / fi;
    for (let k = 0; k < fo && k < seg.length; k++) seg[seg.length - 1 - k] *= k / fo;
    const o = Math.round(p.start * SR);
    if (o >= track.length) { console.log(`!! ${p.key} starts after the film ends: left out of the track`); continue; }
    for (let k = 0; k < seg.length && o + k < track.length; k++) if (o + k >= 0) track[o + k] += seg[k];
  }
  let peak = 0; for (const v of track) peak = Math.max(peak, Math.abs(v));
  console.log(`track peak ${(20 * Math.log10(peak + 1e-12)).toFixed(2)} dBFS`);
  if (peak >= 0.999) { for (let k = 0; k < track.length; k++) track[k] *= 0.98 / peak; console.log("scaled to avoid clipping"); }
  mkdirSync(DIR, { recursive: true });
  writeWav24(join(DIR, "vo-track.wav"), track);
  const out = placed.map(({ _x, ...p }) => p);
  writeFileSync(join(DIR, "placement.json"), JSON.stringify({
    film: opt("name") ?? script.name ?? "film", duration: FILM, sampleRate: SR,
    source: `per-line takes in ${rel(LINES)} (voiceover/tts.mjs${man ? `, voice ${man.voice}, model ${man.model}` : ""}, ${LANG}); sourceStart/sourceEnd are seconds in each line's own file`,
    fades: { in: FADE_IN, out: FADE_OUT },
    note: "start/end cover the audio placed (incl. fades); speechStart/End are the speech bounds measured in each line file; slack = windowEnd - end",
    lines: out,
  }, null, 2) + "\n");
  const ts = (t) => { let ms = Math.round(t * 1000); const h = Math.floor(ms / 3600000); ms -= h * 3600000; const m = Math.floor(ms / 60000); ms -= m * 60000; const s = Math.floor(ms / 1000); ms -= s * 1000; return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`; };
  let srt = "";
  out.forEach((p, k) => {
    const nxt = k + 1 < out.length ? out[k + 1].speechStart - 0.05 : FILM;
    const end = Math.min(Math.max(p.speechEnd + 0.2, p.speechStart + 1.0), nxt);
    srt += `${p.id}\n${ts(p.speechStart)} --> ${ts(end)}\n${p.text}\n\n`;
  });
  writeFileSync(join(DIR, "voiceover.srt"), srt);
  console.log(`wrote ${rel(join(DIR, "vo-track.wav"))} (${(track.length / SR).toFixed(3)} s), ${rel(join(DIR, "placement.json"))}, ${rel(join(DIR, "voiceover.srt"))}`);
  if (problems.length) process.exitCode = 1;
}
