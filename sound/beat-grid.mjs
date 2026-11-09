#!/usr/bin/env node
// Measure a music take's tempo and beat phase and write them into music.json.
//
//   node sound/beat-grid.mjs <music.mp3|wav> [--music music.json] [--bpm 96] [--groove 10,110]
//        [--beats-per-bar 4] [--work sound-build/analysis] [--dry]
//
// Runs the analysis scripts in sound/analysis (python3 with numpy, scipy, soundfile):
//   1. ffmpeg decodes the take to <work>/take.wav (48 kHz float);
//   2. analyze.py take.wav <groove from> <groove to>: onset autocorrelation over the groove; its
//      beat-range peak (0.3-0.75 s, 80-200 BPM), refined by the longest strong peak that is a whole
//      number of beats (a bar or a loop), is the rough tempo when --bpm is not given;
//   3. grid.py take.wav <bpm>: the beat period refined within ±0.25% (folded onset contrast over
//      8-125 s of the take, so the take must be longer than about 20 s) and the beat phase.
// The groove span is --groove, else music.json's "groove" section, else 8 s to 10 s before the end.
// Writes (unless --dry) bpm, beat, bar, beatsPerBar, duration and gridOffset into music.json (created
// beside the take when missing, "file" relative to it), and gridEvidence with the numbers measured.
// gridOffset is set to the first beat's phase: the beat is measured, the downbeat is not. Confirm
// which beat is "1" with analysis/struct.py (chroma novelty by beat-in-bar) and grid.py's kick
// profile, and by listening; move gridOffset by whole beats if needed. Never trust a tempo detector
// alone (sound/README.md: one reported 128 BPM for a 96.000 BPM take).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name, def = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
const take = args[0] && !args[0].startsWith("--") ? resolve(args[0]) : null;
if (!take || flag("help")) {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  console.log(src.slice(1, src.findIndex((l) => l.startsWith("import "))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n").trim());
  process.exit(flag("help") ? 0 : 1);
}
const die = (m) => { console.error(`error: ${m}`); process.exit(1); };
const rel = (p) => { const r = relative(process.cwd(), p); return !r ? p : r.startsWith("..") ? p : r; };
if (!existsSync(take)) die(`no file ${take}`);
const ANALYSIS = join(dirname(fileURLToPath(import.meta.url)), "analysis");
const musicPath = resolve(opt("music") ?? join(dirname(take), "music.json"));
const music = existsSync(musicPath) ? JSON.parse(readFileSync(musicPath, "utf8")) : { file: relative(dirname(musicPath), take) };
const work = resolve(opt("work", "sound-build/analysis"));
mkdirSync(work, { recursive: true });

const run = (cmd, a) => {
  console.log(`› ${cmd} ${a.join(" ")}`);
  const r = spawnSync(cmd, a, { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) die(`${cmd} failed:\n${(r.stderr || r.stdout || "").trim().split("\n").slice(-6).join("\n")}`);
  return r.stdout;
};
const wav = join(work, "take.wav");
run("ffmpeg", ["-v", "error", "-y", "-i", take, "-ar", "48000", "-c:a", "pcm_f32le", wav]);
const duration = parseFloat(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", take]).trim());
if (duration < 20) die(`the take is ${duration.toFixed(1)} s: grid.py needs more than about 20 s of music`);
const grooveSec = (music.sections ?? []).find((s) => s.name === "groove");
const [g0, g1] = opt("groove") ? opt("groove").split(",").map(Number) : grooveSec ? [grooveSec.from, grooveSec.to] : [8, Math.max(18, duration - 10)];
const a = run("python3", ["-I", join(ANALYSIS, "analyze.py"), wav, String(g0), String(g1)]);
process.stdout.write(a.split("\n").filter((l) => /AC peak|dur/.test(l)).map((l) => `  ${l}`).join("\n") + "\n");
let bpm = opt("bpm") ? +opt("bpm") : null, rough = null;
// the beat-range peak is only good to one analysis hop (5.3 ms, about 1% at 100 BPM, more than the
// ±0.25% grid.py searches), so the beat is refined from the longest strong peak (bars, loops) that is
// a whole number of beats: 28.8 s / 48 beats is far finer than 0.597 s
const peaks = [...a.matchAll(/AC peak in \[[\d.]+,[\d.]+\] at lag ([\d.]+)s\s+r=([-\d.]+)/g)].map((x) => ({ L: +x[1], r: +x[2] }));
const beatPeak = peaks.find((p) => p.L >= 0.3 && p.L <= 0.75);
if (beatPeak) {
  let P = beatPeak.L;
  for (const p of peaks) {
    const n = Math.round(p.L / beatPeak.L);
    if (n >= 2 && p.r > 0.5 && Math.abs(p.L / n - beatPeak.L) < 0.012) P = p.L / n; // peaks are in rising lag order: the last fit wins
  }
  rough = 60 / P;
}
if (bpm == null) {
  if (!rough) die("could not read a tempo from analyze.py; pass --bpm");
  bpm = rough;
  console.log(`rough tempo from the onset autocorrelation: ${rough.toFixed(2)} BPM (pass --bpm if the beat is really half or double that)`);
}
const g = run("python3", ["-I", join(ANALYSIS, "grid.py"), wav, String(bpm)]);
process.stdout.write(g.split("\n").filter(Boolean).map((l) => `  ${l}`).join("\n") + "\n");
const pm = g.match(/best beat period ([\d.]+)s -> ([\d.]+) bpm, fold contrast ([\d.]+)/);
const ph = g.match(/beat phase \(onset peak\) ([-\d.]+) ms/);
if (!pm || !ph) die("could not read grid.py's result");
const P = +pm[1], phase = +ph[1] / 1000, bpb = +(opt("beats-per-bar") ?? music.beatsPerBar ?? 4);
const fields = {
  bpm: Math.round((60 / P) * 1000) / 1000, beatsPerBar: bpb, beat: Math.round(P * 100000) / 100000, bar: Math.round(P * bpb * 100000) / 100000,
  gridOffset: Math.round(phase * 10000) / 10000, duration: Math.round(duration * 100) / 100,
  gridEvidence: { measured: new Date().toISOString().slice(0, 10), by: "sound/beat-grid.mjs (analysis/analyze.py + grid.py)", groove: [g0, g1], roughBpm: rough && Math.round(rough * 100) / 100, foldContrast: +pm[3], note: "gridOffset is the first beat's phase; the downbeat is not measured: confirm with analysis/struct.py and by listening, and move it by whole beats if needed" },
};
console.log(`grid: ${fields.bpm} BPM, beat ${fields.beat} s, bar ${fields.bar} s (${bpb}/4), first beat at ${fields.gridOffset} s, fold contrast ${fields.gridEvidence.foldContrast}`);
if (fields.gridEvidence.foldContrast < 1.5) console.log("warning: low fold contrast: the beat is weak or the tempo guess is off; check with --bpm");
if (flag("dry")) { console.log("--dry: music.json not written"); process.exit(0); }
writeFileSync(musicPath, JSON.stringify({ ...music, ...fields }, null, 2) + "\n");
console.log(`wrote the grid fields into ${rel(musicPath)}`);
