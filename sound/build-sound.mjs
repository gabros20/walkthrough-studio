#!/usr/bin/env node
// Sound for a walkthrough film: a music bed fitted to the picture, effects on the cues, an optional
// voiceover with the music ducked under it, one mixed track muxed onto the rendered video.
// Reads the film's cues.json and edl.json (written by film/build.mjs) and the video at run time.
//
//   node sound/build-sound.mjs --video film/renders/draft.mp4                -> film/renders/draft-sound.mp4
//   node sound/build-sound.mjs --video film/renders/final.mp4 --deliver out/my-film.mp4
//        final delivery: the silent render is renamed final.picture-only.mp4 first, the mix is muxed
//        onto it, the captions .srt is copied beside the delivery, and the delivered file must carry a
//        full-length audio stream or the last line says NOT DELIVERED
//   node sound/build-sound.mjs --video film/renders/final-vo.mp4 --voiceover film/voiceover/vo-track.wav --deliver out/my-film-voiceover.mp4
//        voiceover version: voice leads, music ducked under each line (placement.json beside the
//        track drives it), clicks under speech dropped; delivered with the voiceover's .srt
//   node sound/build-sound.mjs --duration 190 --bed-only                    bed of any length, no video
//   node sound/build-sound.mjs --help
//
// Options (paths are relative to the current directory):
//   --film <dir>         the film project (default: ../film next to this folder); cues.json, edl.json,
//                        captions.srt and music.json are looked up there
//   --music <file>       music.json (default <film>/music.json); its "file" is the audio, relative to it
//   --music-file <file>  use this WAV/MP3 instead of music.json's "file" (same measured grid)
//   --sfx <dir>          the effect files (default: $HF_SFX_DIR, else the HyperFrames media-use skill's
//                        audio/assets/sfx folder, searched in the usual skill locations)
//   --work <dir>         where bed.wav, mix.wav, beat-grid.json, last-build.json go (default <film>/sound-build)
//   --cues <f> --edl <f> use these instead of the sidecars next to the video (<name>.cues.json /
//                        <name>.edl.json, also found for <name>.picture-only.mp4) or the film's live files
//   --out <file>         where a draft goes (default <video dir>/<name>-sound.mp4 or -voiceover.mp4)
//   --deliver <file>     final delivery (see above); needs captions (--srt, a <name>.captions.srt
//                        sidecar, or the film's live captions.srt when its cues match)
//   --srt <file>         captions to deliver beside the video
//   --voiceover <wav>    film-length voice track; --placement <file> overrides placement.json beside it
//   --force              mix even when the video length does not match cues.json
//
// Needs node, ffmpeg and ffprobe. Exit code: 0 when every check passes, 2 when one fails (the reason
// is printed), 1 on bad input. The last line is "delivered: <path>", "NOT DELIVERED ...", or
// "no video given: nothing delivered".
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, copyFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, basename, relative } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import * as A from "./lib/audio.mjs";

const SOUND = dirname(fileURLToPath(import.meta.url));
const SR = A.SR;

// ---------------- settings (all the taste lives here) ----------------
const CFG = {
  lufs: -16, // programme loudness target
  maxTruePeak: -1, // dBTP ceiling
  fadeIn: 0.4,
  fadeOut: 2.5,
  bedTail: 2, // bed runs this far past the film end
  xfade: 0.03, // splice crossfade, ends 5 ms before the downbeat
  xfadeLead: 0.005,
  // start offset into the music, whole bars only, so bars fall on multiples of a bar from film 0
  // (the editor cuts on that grid). At most 2 bars of the intro are trimmed.
  startBars: [0, 1, 2],
  // where the final chord should land: the end-card wipe's cut (the lockup is revealed), window around it
  finalChordWindow: { before: 0.6, after: 0.7 },
  // effect level over the local bed: effect's loudest 100 ms vs the bed's 400 ms around the hit (K-weighted)
  // how far each effect sits over the bed where it plays. A click is a 20 ms transient (20 dB crest
  // over its loudest 100 ms, the music has about 11): set by loudness it would peak 8 dB over the
  // music and read sharp, so clicks are set by peak (their peak over the bed's peak within ±0.3 s).
  // Whooshes and the riser are set by loudness: their loudest 100 / 400 ms window vs the bed's level
  // in that same window (K-weighted). Both numbers are reported for every effect.
  over: { click: { measure: "peak", db: 4, win: 0.1 }, whoosh: { measure: "loudness", db: 4.5, win: 0.1 }, riser: { measure: "loudness", db: 4, win: 0.4 } },
  frameLate: 1,
  // a whoosh pulled down this far or more by the peak ceiling gets the music dipped under it instead
  whooshDip: { db: 3, dur: 0.3, ramp: 0.08, ifPulledDb: 1 },
  // voiceover version
  vo: {
    voiceOverMusicDb: 3, // voice lines (gated loudness) sit 3 dB over the undducked music; between lines the music plays at that normal level
    musicUnderVoiceDb: 11, // music ducked to this far under the voice while it speaks
    maxDuckDb: 20,
    attack: 0.35, attackLead: 0.05, // the duck is down 0.05 s before the first word, after a 0.35 s ramp
    release: 0.8, releaseLag: 0.2, // and comes back over 0.8 s starting 0.2 s after the last word
    mergeGap: 2.5, // lines closer than this share one duck (no pumping between them)
    lineSpreadLU: 1.5, // level lines toward their median when they spread more than this
    maxLineGainDb: 4,
    hpHz: 80, hpIfLowShareDb: -20, // high-pass the voice only if energy under 80 Hz is above this share
    clickDb: -4, // clicks outside speech, this much under the captioned version
    clickClear: 0.2, // a click within this of a line is dropped
    fxUnderVoiceDb: 1, // whooshes and riser: loudest 100 ms at least this far under the voice's loudest 100 ms (median line)
  },
};
// The effects, prepared from the bundled files by ffmpeg filter chains.
const SFX = {
  click: { file: "click.mp3", filter: "lowpass=f=5000:p=2,atrim=0:0.26,afade=t=out:st=0.2:d=0.06", note: "bundled click (press + release), low-passed at 5 kHz to take the edge off" },
  whooshA: { file: "whoosh.mp3", filter: "anull", note: "bundled short whoosh, 99% of its energy 150-1000 Hz" },
  whooshB: { file: "whoosh.mp3", filter: "asetrate=37044,aresample=48000", note: "the same whoosh slowed to 0.84x (3 semitones lower, 0.68 s): the second take" },
  riser: { file: "riser.mp3", filter: "highpass=f=200:p=2,highpass=f=200:p=2,atrim=0:4.12,afade=t=out:st=4.04:d=0.08", note: "bundled riser (its build is 0.5-4.1 s, the rest of the file is silence); high-passed at 200 Hz to drop its sub rumble (84% of its energy) and the clipping that comes with it" },
};

// ---------------- args ----------------
const args = process.argv.slice(2);
const opt = (name, def = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
if (flag("help") || args.length === 0) {
  // the usage is the comment block at the top of this file
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  console.log(src.slice(1, src.findIndex((l) => l.startsWith("import "))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n").trim());
  process.exit(0);
}
const cwdPath = (p) => (p == null ? null : resolve(p));
const FILM = cwdPath(opt("film")) ?? resolve(SOUND, "../film");
const WORK = cwdPath(opt("work")) ?? join(FILM, "sound-build");
mkdirSync(WORK, { recursive: true });
let videoArg = cwdPath(opt("video"));
const bedOnly = flag("bed-only");
const force = flag("force");
const voArg = cwdPath(opt("voiceover"));
const deliverArg = cwdPath(opt("deliver"));
const TAG = voArg ? "-vo" : ""; // the voiceover build writes its own copies of every output
const rel = (p) => { const r = relative(process.cwd(), p); return !r ? p : r.startsWith("..") ? p : r; }; // short when under the current directory

// The effect files: the HyperFrames media-use skill bundles click, whoosh, riser and more under
// audio/assets/sfx (with a manifest.json and CREDITS.md). Where that skill is installed varies.
function findSfxDir() {
  const given = opt("sfx") ?? process.env.HF_SFX_DIR;
  if (given) return resolve(given);
  const h = homedir();
  const roots = [join(h, ".agents/skills/media-use"), join(h, ".claude/skills/media-use"), join(h, ".codex/skills/media-use")];
  for (const r of roots) if (existsSync(join(r, "audio/assets/sfx/click.mp3"))) return join(r, "audio/assets/sfx");
  // plugin installs: ~/.claude/plugins/**/media-use/audio/assets/sfx (one level of search per folder)
  const walk = (dir, depth) => {
    if (depth < 0 || !existsSync(dir)) return null;
    if (existsSync(join(dir, "media-use/audio/assets/sfx/click.mp3"))) return join(dir, "media-use/audio/assets/sfx");
    for (const e of readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && !e.name.startsWith(".")) { const f = walk(join(dir, e.name), depth - 1); if (f) return f; }
    return null;
  };
  return walk(join(h, ".claude/plugins"), 6);
}
const log = (...a) => console.log(...a);
const warns = [];
const warn = (m) => { warns.push(m); console.warn(`warning: ${m}`); };
const r3 = (x) => Math.round(x * 1000) / 1000;
const r2 = (x) => Math.round(x * 100) / 100;

// ---------------- inputs ----------------
const musicPath = cwdPath(opt("music")) ?? join(FILM, "music.json");
if (!existsSync(musicPath)) { console.error(`error: no music.json at ${musicPath} (start from sound/music.example.json; see sound/README.md)`); process.exit(1); }
const M = JSON.parse(readFileSync(musicPath, "utf8"));
{ // validate, derive, and move every time so the first downbeat is at 0 s in the source
  const need = ["bpm", "beatsPerBar", "loopBars", "grooveEntry", "finalChord", "spliceWindow", "sections"];
  const missing = need.filter((k) => M[k] == null);
  if (!M.file && !opt("music-file")) missing.push("file");
  if (missing.length) { console.error(`error: ${musicPath} is missing ${missing.join(", ")} (see sound/README.md, music.json)`); process.exit(1); }
  M.beat ??= 60 / M.bpm;
  M.bar ??= M.beat * M.beatsPerBar;
  M.audio = opt("music-file") ? resolve(opt("music-file")) : resolve(dirname(musicPath), M.file);
  const g = M.gridOffset ?? 0;
  if (g) { // trim the lead-in before the first downbeat when decoding; every music.json time moves by -g
    const sh = (t) => r3(t - g);
    M.grooveEntry = sh(M.grooveEntry); M.finalChord = sh(M.finalChord);
    M.spliceWindow = { ...M.spliceWindow, from: sh(M.spliceWindow.from), to: sh(M.spliceWindow.to) };
    M.sections = M.sections.map((x) => ({ ...x, from: Math.max(0, sh(x.from)), to: sh(x.to) }));
    if (M.shortOutro) M.shortOutro = { ...M.shortOutro, a: sh(M.shortOutro.a), b: sh(M.shortOutro.b) };
    if (M.duration) M.duration = sh(M.duration);
  }
}
// The final delivery never sits under a name that looks finished while it has no sound: a render
// without an audio stream is renamed <name>.picture-only.mp4 before anything else (its sidecars
// <name>.cues.json / .edl.json / .captions.srt are still found).
const hasAudio = (f) => JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type", "-of", "json", f], { encoding: "utf8" })).streams.some((x) => x.codec_type === "audio");
if (videoArg && deliverArg && !/\.picture-only\.mp4$/.test(videoArg) && existsSync(videoArg) && !hasAudio(videoArg)) {
  const to = videoArg.replace(/\.mp4$/, ".picture-only.mp4");
  renameSync(videoArg, to);
  log(`renamed the silent render ${rel(videoArg)} -> ${rel(to)}`);
  videoArg = to;
}
// cues/edl: --cues/--edl, else a snapshot next to the video (renders/<name>.cues.json / .edl.json), else the live files
const sideFor = (ext) => { // renders/<name>.<ext> beside the video; a ".picture-only" video also finds <name>.<ext>
  if (!videoArg) return null;
  const base = videoArg.replace(/\.mp4$/, "");
  for (const b of [base, base.replace(/\.picture-only$/, "")]) { const f = `${b}.${ext}`; if (existsSync(f)) return f; }
  return null;
};
const side = (ext) => sideFor(`${ext}.json`);
const cuesPath = cwdPath(opt("cues")) ?? side("cues") ?? join(FILM, "cues.json");
const edlPath = cwdPath(opt("edl")) ?? side("edl") ?? join(FILM, "edl.json");
// a bed of a given length needs no film: without cues.json/edl.json it has no effects to place
// and lands the final chord 4.45 s before the end (where an end-card wipe would cut)
const noFilm = bedOnly && opt("duration") && !existsSync(cuesPath);
if (!noFilm && !existsSync(cuesPath)) { console.error(`error: no cues.json at ${cuesPath} (build the film first, or pass --cues)`); process.exit(1); }
log(noFilm ? "no cues.json: bed only, from --duration" : `cues ${rel(cuesPath)}, edl ${rel(edlPath)}`);
const cuesFile = noFilm ? { fps: 30, duration: parseFloat(opt("duration")), cues: [] } : JSON.parse(readFileSync(cuesPath, "utf8"));
const liveSame = !noFilm && existsSync(join(FILM, "cues.json")) && readFileSync(join(FILM, "cues.json"), "utf8") === readFileSync(cuesPath, "utf8");
const voSrt = () => { // the voiceover's .srt: --srt, else the one .srt beside the voice track
  const dir = dirname(voArg);
  const list = execFileSync("ls", [dir], { encoding: "utf8" }).split("\n").filter((f) => f.endsWith(".srt"));
  return list.length === 1 ? join(dir, list[0]) : null;
};
const captionsSrc = opt("srt") ? resolve(opt("srt")) : voArg ? voSrt() : sideFor("captions.srt") ?? (liveSame && existsSync(join(FILM, "captions.srt")) ? join(FILM, "captions.srt") : null);
const edl = existsSync(edlPath) ? JSON.parse(readFileSync(edlPath, "utf8")) : { scenes: [] };
const FPS = cuesFile.fps;
const frame = 1 / FPS;
let D = cuesFile.duration;
let video = null;
if (videoArg) {
  video = videoArg;
  const vd = A.ffprobeDuration(video, "v:0");
  const vf = A.ffprobeFrames(video);
  log(`video ${basename(video)}: ${vd.toFixed(3)} s, ${vf.frames} frames at ${vf.fps} fps; cues.json says ${D.toFixed(3)} s`);
  if (Math.abs(vd - D) > frame + 1e-3) {
    const m = `video is ${vd.toFixed(3)} s but cues.json is ${D.toFixed(3)} s: the cues belong to another build`;
    if (!force) { console.error(`error: ${m}. Rebuild (node build.mjs) for this video, or pass --force to mix anyway.`); process.exit(1); }
    warn(`${m} (--force): effects will be placed by these cues`);
  }
  D = vf.frames / vf.fps; // exact picture length
}
if (opt("duration")) D = parseFloat(opt("duration"));

const cues = cuesFile.cues;
const endCut = cues.find((c) => c.type === "transition" && c.kind === "cut" && c.to === "end")?.t;
const endWipe = cues.find((c) => c.type === "transition" && c.kind === "wipe" && c.where === "end")?.t;
const scale = D - cuesFile.duration; // with --duration, end-card events move with the end
const markCut = endWipe != null ? endWipe + 0.45 + scale : D - 4.45;
const titleEnd = edl.scenes?.[0]?.start ?? 8;

// ---------------- fit: loops added (k) and start offset (s) ----------------
const L = M.loopBars * M.bar; // 10 s
const W = M.spliceWindow;
const maxPerSplice = Math.floor((W.to - W.from) / L);
// Two endings: the real one (outro 6 bars, then the final chord) and, only when that misses, the
// outro with its last 2 bars dropped (bar 47, F, straight into the final chord: same F-A-C on top).
// With s in [0, 5] the first reaches final-chord times 0-5 s past a loop line, the second 5-10 s.
const OUTRO_CUT = M.shortOutro; // { a, b }: jump from a to b inside the outro
let fit = null;
for (const short of OUTRO_CUT ? [false, true] : [false]) for (let k = -2 * maxPerSplice; k <= 2 * maxPerSplice; k++) for (const s of CFG.startBars.map((b) => b * M.bar)) {
  const fc = M.finalChord - (short ? OUTRO_CUT.b - OUTRO_CUT.a : 0);
  const R = fc + k * L - s;
  const dev = R - markCut;
  const inWin = dev >= -CFG.finalChordWindow.before && dev <= CFG.finalChordWindow.after;
  const groove = M.grooveEntry - s;
  // land the final chord nearest the end-card wipe cut; then keep the intro and the real outro
  const cost = Math.abs(dev) * (inWin ? 1 : 3) + 0.1 * Math.abs(groove - titleEnd) + 0.05 * s + (short ? 0.5 : 0);
  if (!fit || cost < fit.cost) fit = { k, short, fc, s, inWin, cost };
}
fit.R = fit.fc + fit.k * L - fit.s;
fit.dev = fit.R - markCut;
fit.groove = M.grooveEntry - fit.s;
log(`fit: ${fit.k >= 0 ? "+" : ""}${fit.k} loops (${fit.k * L} s), ${fit.short ? "short outro (4 bars)" : "full outro"}, start ${fit.s.toFixed(3)} s into the music; final chord at film ${fit.R.toFixed(3)} s (${fit.dev >= 0 ? "+" : ""}${fit.dev.toFixed(3)} s from the end-card wipe cut ${markCut.toFixed(3)}); groove enters at ${fit.groove.toFixed(3)} s (title ends ${titleEnd})`);
if (Math.abs(fit.dev) > 0.02) warn(`final chord (bar line ${fit.R.toFixed(3)} s) is ${fit.dev.toFixed(3)} s from the end-card wipe cut ${markCut.toFixed(3)}: move the end card by ${fit.dev.toFixed(3)} s to land the lockup on it`);

// ---------------- music, splice choice ----------------
if (!existsSync(M.audio)) { console.error(`error: music file not found: ${M.audio}`); process.exit(1); }
const src = A.decode(M.audio, M.gridOffset ? `atrim=start=${M.gridOffset},asetpts=PTS-STARTPTS` : null);
const srcK = A.kweight(src);
const downbeats = [];
for (let t = W.from; t <= W.to + 1e-9; t += M.bar) downbeats.push(r3(t));

function scoreSplice(a, b) {
  // what plays after the join (b side) against what would naturally follow at a
  const xa = a - CFG.xfadeLead;
  const after = A.bandDist(A.bandFrames(src, b - CFG.xfadeLead, 8), A.bandFrames(src, xa, 8));
  const bar = A.bandDist(A.bandFrames(src, b, 117), A.bandFrames(src, a, 117)); // 1.25 s, two beats
  const levelJump = A.levelK(srcK, b, b + M.beat) - A.levelK(srcK, a, a + M.beat);
  const i0 = Math.round((a - CFG.xfade - CFG.xfadeLead) * SR), j0 = Math.round((b - CFG.xfade - CFG.xfadeLead) * SR), n = Math.round(CFG.xfade * SR);
  const lowA = A.lowpassMono(A.mono(src, i0 - 4800, i0 + n), 200).slice(4800), lowB = A.lowpassMono(A.mono(src, j0 - 4800, j0 + n), 200).slice(4800);
  const lowCorr = A.corr(lowA, lowB);
  const score = after + 0.5 * bar + Math.abs(levelJump) + (lowCorr < 0.3 ? 0.3 - lowCorr : 0);
  return { a, b, after: r2(after), bar: r2(bar), levelJump: r2(levelJump), lowCorr: r2(lowCorr), score: r2(score) };
}
function candidates(k) {
  const out = [];
  for (const a of downbeats) { const b = r3(a - k * L); if (b >= W.from - 1e-9 && b <= W.to + 1e-9) out.push(scoreSplice(a, b)); }
  return out.sort((x, y) => x.score - y.score);
}
let splices = [];
if (fit.k !== 0) {
  if (Math.abs(fit.k) <= maxPerSplice) {
    const c = candidates(fit.k);
    splices = [c[0]];
    log(`splice candidates for ${fit.k} loops: ${c.length}; best ${c[0].a} -> ${c[0].b} (score ${c[0].score}), median score ${c[Math.floor(c.length / 2)].score}, worst ${c[c.length - 1].score}`);
  } else {
    const k1 = Math.sign(fit.k) * Math.ceil(Math.abs(fit.k) / 2), k2 = fit.k - k1;
    const c1 = candidates(k1), c2 = candidates(k2);
    let best = null;
    for (const p of c1) for (const q of c2) if (q.a >= p.b + L - 1e-9 && (!best || p.score + q.score < best[0].score + best[1].score)) best = [p, q];
    if (!best) throw new Error(`cannot place ${fit.k} loops with two splices`);
    splices = best;
  }
}
if (fit.short) splices.push({ ...scoreSplice(OUTRO_CUT.a, OUTRO_CUT.b), kind: "outro" });

// ---------------- assemble the bed ----------------
const NB = Math.round((D + CFG.bedTail) * SR);
const bed = A.alloc(NB);
const joins = [];
{
  let f = 0; // output sample
  let p = Math.round(fit.s * SR); // source sample (negative = silence first)
  const nx = Math.round(CFG.xfade * SR), lead = Math.round(CFG.xfadeLead * SR);
  const copy = (from, to) => { for (let i = from; i < to && f < NB; i++, f++) if (i >= 0 && i < A.len(src)) { bed.L[f] = src.L[i]; bed.R[f] = src.R[i]; } };
  for (const sp of splices) {
    const a = Math.round(sp.a * SR), b = Math.round(sp.b * SR);
    copy(p, a - lead - nx);
    const filmJoin = (f + nx) / SR; // where the b side is fully in
    for (let j = 0; j < nx && f < NB; j++, f++) { // equal-power crossfade
      const x = (j + 0.5) / nx, ga = Math.cos((x * Math.PI) / 2), gb = Math.sin((x * Math.PI) / 2);
      const ia = a - lead - nx + j, ib = b - lead - nx + j;
      bed.L[f] = ga * src.L[ia] + gb * src.L[ib]; bed.R[f] = ga * src.R[ia] + gb * src.R[ib];
    }
    p = b - lead;
    joins.push({ ...sp, film: r3(filmJoin), filmDownbeat: r3(filmJoin + CFG.xfadeLead) });
  }
  copy(p, A.len(src) + NB);
}
const filmOf = (srcT) => { // film time of a source time on the played path
  let off = -fit.s, prevEnd = Infinity;
  const segs = [{ from: fit.s, to: splices[0]?.a ?? Infinity, off }];
  for (let i = 0; i < splices.length; i++) { off += splices[i].a - splices[i].b; segs.push({ from: splices[i].b, to: splices[i + 1]?.a ?? Infinity, off }); }
  return segs.filter((g) => srcT >= g.from - 1e-9 && srcT < g.to - 1e-9).map((g) => srcT + g.off);
};
const bedK = A.kweight(bed);

// ---------------- verify each join ----------------
function hfOnsets(buf, t0, t1) { // high-frequency onset flux, 2.5 ms hops
  const a = Math.max(1, Math.round(t0 * SR)), b = Math.min(A.len(buf) - 1, Math.round(t1 * SR)), H = 120;
  const t = [], v = []; let prev = null;
  for (let i = a; i + H <= b; i += H) {
    let s = 0;
    for (let j = i; j < i + H; j++) { const d = 0.5 * (buf.L[j] - buf.L[j - 1] + buf.R[j] - buf.R[j - 1]); s += d * d; }
    const e = Math.log(s + 1e-12);
    t.push((i + H / 2) / SR); v.push(prev == null ? 0 : Math.max(0, e - prev)); prev = e;
  }
  return { t, v };
}
function beatOffsets(buf, grid, t0, t1) { // onset peak within ±40 ms of each grid beat in [t0, t1)
  const o = hfOnsets(buf, t0 - 0.1, t1 + 0.1), out = [];
  for (const g of grid) if (g >= t0 && g < t1) {
    let best = -1, at = null;
    for (let i = 0; i < o.t.length; i++) if (Math.abs(o.t[i] - g) <= 0.025 && o.v[i] > best) { best = o.v[i]; at = o.t[i]; }
    if (at != null) out.push((at - g) * 1000);
  }
  return out;
}
const mean = (x) => { const y = [...x].sort((p, q) => p - q); return y.length ? (y[(y.length - 1) >> 1] + y[y.length >> 1]) / 2 : NaN; }; // median
const filmBeats = []; // the film-time beat grid of the bed
for (let n = Math.ceil(fit.s / M.beat); ; n++) { const t = n * M.beat - fit.s; if (t > D + CFG.bedTail) break; if (t >= 0) filmBeats.push(t); }
// after the joins the grid continues unbroken: every splice moves by whole loops
function clickRatio(J) {
  const d2 = (buf, i) => Math.abs(buf.L[i + 1] - 2 * buf.L[i] + buf.L[i - 1]) + Math.abs(buf.R[i + 1] - 2 * buf.R[i] + buf.R[i - 1]);
  let inX = 0, around = 0;
  const x0 = Math.round((J - CFG.xfade - 0.005) * SR), x1 = Math.round((J + 0.002) * SR);
  for (let i = x0; i < x1; i++) inX = Math.max(inX, d2(bed, i));
  for (let i = Math.round((J - 2.5) * SR); i < Math.round((J + 2.5) * SR); i++) if (i < x0 - 960 || i > x1 + 960) around = Math.max(around, d2(bed, i));
  return inX / around;
}
for (const j of joins) {
  const J = j.film, a = j.a - CFG.xfadeLead;
  // spectral step across the join vs the natural step at the same place in the source
  const preB = A.bandFrames(bed, J - CFG.xfade - 0.005 - 1024 / SR, 1), postB = A.bandFrames(bed, J, 1);
  const preS = A.bandFrames(src, a - CFG.xfade - 0.005 - 1024 / SR, 1), postS = A.bandFrames(src, a, 1);
  j.spectralStep = r2(A.bandDist(preB, postB));
  j.spectralStepNatural = r2(A.bandDist(preS, postS));
  j.levelStep = r2(A.levelK(bedK, J, J + M.beat) - A.levelK(bedK, J - M.beat, J));
  j.levelStepNatural = r2(A.levelK(srcK, a, a + M.beat) - A.levelK(srcK, a - M.beat, a));
  const bb = j.b - CFG.xfadeLead; // the natural arrival at b, for a jump into a different section
  j.levelStepNaturalAtB = r2(A.levelK(srcK, bb, bb + M.beat) - A.levelK(srcK, bb - M.beat, bb));
  j.spectralStepNaturalAtB = r2(A.bandDist(A.bandFrames(src, bb - CFG.xfade - 0.005 - 1024 / SR, 1), A.bandFrames(src, bb, 1)));
  j.levelStepBar = r2(A.levelK(bedK, J, J + M.bar) - A.levelK(bedK, J - M.bar, J));
  // the final chord has no beat: an outro join is checked on the bars before it only
  const before = beatOffsets(bed, filmBeats, J - 8 * M.bar, J), after = j.kind === "outro" ? [] : beatOffsets(bed, filmBeats, J, J + 8 * M.bar);
  j.gridBeforeMs = r2(mean(before)); j.gridAfterMs = after.length ? r2(mean(after)) : "n/a";
  j.gridShiftMs = after.length ? r2(mean(after) - mean(before)) : null;
  j.gridMaxAbsMs = r2(Math.max(...before.map(Math.abs), ...after.map(Math.abs)));
  j.beatsChecked = before.length + after.length;
  j.clickRatio = r2(clickRatio(J));
  j.peakDb = r2(A.samplePeakDb(bed, J - 0.05, J + 0.05));
  log(`join at film ${J.toFixed(3)} (source ${j.a} -> ${j.b}, ${j.kind === "outro" ? "short outro" : (j.a - j.b) / L + " loops"}): spectral step ${j.spectralStep} dB (natural ${j.spectralStepNatural} / ${j.spectralStepNaturalAtB}), level step ${j.levelStep} dB (natural ${j.levelStepNatural} / ${j.levelStepNaturalAtB}), beat grid ${j.gridBeforeMs} ms before / ${j.gridAfterMs} ms after (max |dev| ${j.gridMaxAbsMs} ms over ${j.beatsChecked} beats), click ratio ${j.clickRatio}`);
}
// gaps: quietest 50 ms in the bed before the final chord's release
{
  const e = A.envelope(bed, 0.05, 0, Math.min(D, fit.R + M.bar));
  const mi = e.db.indexOf(Math.min(...e.db));
  var bedMin = { db: r2(e.db[mi]), at: r3(e.t[mi]) };
  log(`bed: quietest 50 ms before the release ${bedMin.db} dBFS at ${bedMin.at} s`);
  if (bedMin.db < -50) warn(`bed has a near-silent spot (${bedMin.db} dBFS at ${bedMin.at} s)`);
}

// ---------------- beat grid for the editor ----------------
const sectionAt = (srcT) => M.sections.find((s) => srcT >= s.from - 1e-9 && srcT < s.to - 1e-9)?.name ?? "tail";
const bars = [];
{
  // walk the played path bar by bar
  const path = [{ from: fit.s, to: splices[0]?.a ?? M.duration }];
  splices.forEach((sp, i) => path.push({ from: sp.b, to: splices[i + 1]?.a ?? M.duration }));
  let off = -fit.s;
  path.forEach((seg, i) => {
    if (i > 0) off += splices[i - 1].a - splices[i - 1].b;
    for (let n = Math.ceil(seg.from / M.bar - 1e-9); n * M.bar < seg.to - 1e-9; n++) {
      const st = n * M.bar, ft = st + off;
      if (ft < -1e-9 || ft > D + CFG.bedTail) continue;
      const loopBar = st >= M.grooveEntry && st < M.finalChord ? (Math.round((st - M.grooveEntry) / M.bar) % M.loopBars) + 1 : null;
      bars.push({ bar: bars.length + 1, t: r3(ft), source: st, section: sectionAt(st), ...(loopBar ? { loopBar } : {}), ...(i > 0 && st === seg.from ? { afterSplice: true } : {}) });
    }
  });
}
const offGrid = bars.filter((b) => Math.abs(b.t / M.bar - Math.round(b.t / M.bar)) > 1e-6);
if (offGrid.length) { console.error(`error: ${offGrid.length} bars off the ${M.bar} s film grid (first at ${offGrid[0].t})`); process.exit(1); }
const transitions = cues.filter((c) => c.type === "transition").map((c) => {
  const t = c.kind === "wipe" ? c.t + 0.45 : c.kind === "whip" ? c.t + 0.12 : c.t;
  const nb = bars.reduce((best, b) => (Math.abs(b.t - t) < Math.abs(best.t - t) ? b : best), bars[0]);
  return { cue: c.t, kind: c.kind, ...(c.to ? { to: c.to } : {}), ...(c.where ? { where: c.where } : {}), cutAt: r3(t), nearestBar: nb.bar, barAt: nb.t, moveBy: r3(nb.t - t) };
});
const beatGrid = {
  note: `Film-time grid of the music bed made by sound/build-sound.mjs for this picture. Bars are ${r3(M.bar)} s (${M.bpm} BPM, ${M.beatsPerBar}/4); the grid is unbroken across splices. To put a scene change on a bar, move it by moveBy (positive = later). Regenerated on every sound build.`,
  filmDuration: r3(D), bpm: M.bpm, beat: M.beat, bar: M.bar,
  musicStartsAt: r3(Math.max(0, -fit.s)), sourceOffset: fit.s,
  grooveEntersAt: r3(fit.groove), finalChordAt: r3(fit.R), releaseAt: r3(fit.R + M.bar),
  splices: joins.map((j) => ({ film: j.filmDownbeat, from: j.a, to: j.b })),
  bars, beats: filmBeats.filter((t) => t <= D).map(r3), transitions,
};
writeFileSync(join(WORK, `beat-grid${TAG}.json`), JSON.stringify(beatGrid, null, 1) + "\n");

if (bedOnly) {
  A.writeWavF32(join(WORK, "bed.wav"), bed);
  log(`bed only: ${rel(join(WORK, "bed.wav"))} (${(NB / SR).toFixed(3)} s), ${rel(join(WORK, "beat-grid.json"))}`);
  process.exit(0);
}

// ---------------- effects ----------------
const CACHE = join(WORK, ".cache");
const SFX_DIR = findSfxDir();
if (!SFX_DIR || !existsSync(SFX_DIR)) { console.error("error: effect files not found: pass --sfx <dir> or set HF_SFX_DIR (the HyperFrames media-use skill's audio/assets/sfx; see sound/README.md)"); process.exit(1); }
log(`effects from ${SFX_DIR}`);
mkdirSync(CACHE, { recursive: true });
// first transient of an envelope: the first local maximum within 6 dB of the loudest point;
// onset: the first frame within 12 dB of it
function firstHit(env) {
  const pk = Math.max(...env.db);
  let i = env.db.findIndex((v) => v >= pk - 6);
  while (i + 1 < env.db.length && env.db[i + 1] > env.db[i]) i++;
  return { peak: env.t[i], onset: env.t[env.db.findIndex((v) => v >= pk - 12)], pk };
}
const fx = {};
for (const [id, d] of Object.entries(SFX)) {
  const buf = A.decode(join(SFX_DIR, d.file), d.filter);
  const kb = A.kweight(buf);
  const peak = firstHit(A.envelope(buf, 0.0025)).peak;
  const l100 = A.maxLevelK(kb, 0.1), l400 = A.maxLevelK(kb, 0.4);
  // the riser lands by its loudest 100 ms (its crest), the short effects by their first transient
  fx[id] = { buf, kb, l100, l400, hit: id === "riser" ? l100.at : peak, dur: A.len(buf) / SR, tp: A.samplePeakDb(buf), note: d.note };
}
const events = [];
for (const c of cues) {
  if (c.type === "click" && !c.inTimelapse) events.push({ kind: "click", fx: "click", at: c.t, label: c.label });
  if (c.type === "transition") {
    const late = CFG.frameLate * frame;
    if (c.kind === "push") events.push({ kind: "whoosh", at: c.t + late, label: "push" });
    if (c.kind === "whip") events.push({ kind: "whoosh", at: c.t + 0.12 + late, label: "whip" });
    if (c.kind === "wipe" && c.where === "title") events.push({ kind: "whoosh", at: c.t + 0.45 + late, label: "title wipe" });
    // end wipe: the riser carries it (it crests on the final chord, at the wipe's cut)
  }
}
events.filter((e) => e.kind === "whoosh").forEach((e, i) => (e.fx = i % 2 ? "whooshB" : "whooshA"));
events.push({ kind: "riser", fx: "riser", at: fit.R, label: "into the end card, crest on the final chord" });
events.sort((a, b) => a.at - b.at);

// ---------------- mix ----------------
const N = Math.round(D * SR);
const voLinesEarly = voArg ? readPlacement() : null;
const droppedClicks = [];
if (voLinesEarly) for (let i = events.length - 1; i >= 0; i--) {
  const e = events[i];
  if (e.kind === "click" && voLinesEarly.some((l) => e.at >= l.start - CFG.vo.clickClear && e.at <= l.end + CFG.vo.clickClear)) { droppedClicks.push({ t: r3(e.at), label: e.label }); events.splice(i, 1); }
}
const fadeStart = Math.max(0, -fit.s);
const music = A.alloc(N);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  let g = 1;
  if (t < fadeStart + CFG.fadeIn) g *= Math.max(0, Math.sin(((t - fadeStart) / CFG.fadeIn) * (Math.PI / 2)));
  if (t > D - CFG.fadeOut) g *= Math.cos(((t - (D - CFG.fadeOut)) / CFG.fadeOut) * (Math.PI / 2));
  music.L[i] = bed.L[i] * g; music.R[i] = bed.R[i] * g;
}
let VO = null, voice = null, musicKraw = null;
if (voArg) { musicKraw = A.kweight(music); ({ VO, voice } = voiceover()); }
const musicK = A.kweight(music);
// each effect is set against the bed right where it plays (see CFG.over)
for (const e of events) {
  const f = fx[e.fx], o = CFG.over[e.kind];
  e.start = Math.round((e.at - f.hit) * SR) / SR;
  const lw = o.win === 0.4 ? f.l400 : f.l100;
  const at = e.start + lw.at; // the effect's loudest window, placed
  e.bedPeak = A.samplePeakDb(music, e.at - 0.3, e.at + 0.3);
  e.bedWin = A.levelK(musicK, at - o.win / 2, at + o.win / 2);
  e.gainDb = o.measure === "peak" ? e.bedPeak + o.db - f.tp : e.bedWin + o.db - lw.level;
  e.capDb = 0;
  if (VO) { // voice leads: quieter clicks, whooshes and riser never over the voice
    e.voDb = 0;
    if (e.kind === "click") e.voDb = CFG.vo.clickDb;
    else { const over = f.l100.level + e.gainDb - (VO.voice100 - CFG.vo.fxUnderVoiceDb); if (over > 0) e.voDb = -over; }
    e.gainDb += e.voDb;
  }
}
let voiceUsed = null, voLimit = null;
function render(gN) {
  const mx = A.alloc(N);
  for (let i = 0; i < N; i++) { mx.L[i] = music.L[i] * gN; mx.R[i] = music.R[i] * gN; }
  if (voice) { // the voice, peak-limited only if its own peaks would pass the ceiling at this gain
    const thr = A.dbToGain(CFG.maxTruePeak - PEAK_MARGIN - 1 - VO_MARGIN) / gN;
    voLimit = A.samplePeakDb(voice) > 20 * Math.log10(thr) ? A.limitPeaks(voice, thr) : { buf: voice, limited: 0, maxReductionDb: 0 };
    voiceUsed = voLimit.buf;
    for (let i = 0; i < N; i++) { mx.L[i] += voiceUsed.L[i] * gN; mx.R[i] += voiceUsed.R[i] * gN; }
  }
  for (const e of events) {
    const f = fx[e.fx], g = A.dbToGain(e.gainDb + e.capDb) * gN, st = Math.round(e.start * SR);
    for (let j = 0; j < A.len(f.buf); j++) { const i = st + j; if (i >= 0 && i < N) { mx.L[i] += g * f.buf.L[j]; mx.R[i] += g * f.buf.R[j]; } }
  }
  return mx;
}
const PEAK_MARGIN = 1.2; // sample peak kept this far under the true-peak ceiling (inter-sample overs)
// voiceover build only: extra margin, raised automatically when the encoded file still overshoots (speech sibilance survives AAC worse)
const VO_MARGIN = voArg ? parseFloat(process.env.SOUND_VO_MARGIN ?? "0") : 0;
const tmpRaw = join(CACHE, "mix-pass.wav");
A.writeWavF32(tmpRaw, music);
const raw = A.ebur128(tmpRaw);
let norm = CFG.lufs - raw.I, mixed = null;
if (voice) for (let pass = 0; pass < 3; pass++) { // with a voice the music alone is a poor first guess: settle the gain before any peak caps
  A.writeWavF32(tmpRaw, render(A.dbToGain(norm)));
  const m = A.ebur128(tmpRaw);
  log(`voice pre-pass ${pass + 1}: ${m.I} LUFS`);
  norm += CFG.lufs - m.I;
}
function settle() {
  for (let pass = 0; pass < 6; pass++) {
    mixed = render(A.dbToGain(norm));
    let capped = 0;
    for (const e of events) {
      const pk = A.samplePeakDb(mixed, e.start, e.start + fx[e.fx].dur);
      const over = pk - (CFG.maxTruePeak - PEAK_MARGIN - VO_MARGIN);
      if (over > 0.01) { e.capDb -= over + 0.1; capped++; if (process.env.SOUND_DEBUG) log(`  cap ${e.label} at ${e.at.toFixed(2)}: mix peak ${pk.toFixed(2)}`); }
    }
    A.writeWavF32(tmpRaw, mixed);
    const m = A.ebur128(tmpRaw);
    log(`mix pass ${pass + 1}: ${m.I} LUFS, TP ${m.TP} dBTP, ${capped} effects pulled down for peaks`);
    if (!capped && Math.abs(m.I - CFG.lufs) < 0.05) break;
    norm += CFG.lufs - m.I;
  }
}
settle();
// A whoosh that the peak ceiling pulled down under the music gets a short dip in the music instead:
// CFG.whooshDip.db over CFG.whooshDip.dur round the whoosh's loudest 100 ms (raised-cosine edges), then the mix settles again.
const dips = [];
for (const e of events) if (e.kind === "whoosh" && e.capDb <= -CFG.whooshDip.ifPulledDb) {
  const c = e.start + fx[e.fx].l100.at, h = CFG.whooshDip.dur / 2, ramp = CFG.whooshDip.ramp;
  for (let j = Math.max(0, Math.floor((c - h) * SR)); j < Math.min(N, Math.ceil((c + h) * SR)); j++) {
    const t = j / SR - (c - h), k = t < ramp ? 0.5 - 0.5 * Math.cos((Math.PI * t) / ramp) : t > 2 * h - ramp ? 0.5 - 0.5 * Math.cos((Math.PI * (2 * h - t)) / ramp) : 1;
    const g = A.dbToGain(-CFG.whooshDip.db * k);
    music.L[j] *= g; music.R[j] *= g;
  }
  dips.push({ t: r3(e.at), label: e.label, pulledBeforeDb: r2(e.capDb), dipDb: -CFG.whooshDip.db, from: r3(c - h), to: r3(c + h) });
  e.dipDb = -CFG.whooshDip.db; e.capDb = 0;
  e.gainDb -= CFG.whooshDip.db; // still aimed at its usual level over the (now dipped) music, never above it
}
if (dips.length) {
  log(`music dipped ${CFG.whooshDip.db} dB for ${CFG.whooshDip.dur} s under ${dips.length} whoosh(es) the peak ceiling had pulled down: ${dips.map((d) => `${d.t} (${d.label}, was ${d.pulledBeforeDb} dB)`).join(", ")}`);
  settle();
  const mk = A.kweight(music); // what the whooshes are now heard against
  for (const e of events) if (e.kind === "whoosh") { const f = fx[e.fx], at = e.start + f.l100.at; e.bedWin = A.levelK(mk, at - 0.05, at + 0.05); e.bedPeak = A.samplePeakDb(music, e.at - 0.3, e.at + 0.3); }
}
const gN = A.dbToGain(norm);
log(`music alone ${raw.I} LUFS; programme gain ${norm.toFixed(2)} dB`);
const mix = mixed;
const mixF = join(CACHE, "mix-f32.wav");
A.writeWavF32(mixF, mix);
const mixWav = join(WORK, `mix${TAG}.wav`);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mixF, "-c:a", "pcm_s24le", mixWav]);
if (!voArg) { // the bed file belongs to the captioned build
const bedOut = A.alloc(NB);
for (let i = 0; i < NB; i++) {
  const t = i / SR, g = gN * (t < fadeStart + CFG.fadeIn ? Math.max(0, Math.sin(((t - fadeStart) / CFG.fadeIn) * (Math.PI / 2))) : 1);
  bedOut.L[i] = bed.L[i] * g; bedOut.R[i] = bed.R[i] * g;
}
const bedF = join(CACHE, "bed-f32.wav");
A.writeWavF32(bedF, bedOut);
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", bedF, "-c:a", "pcm_s24le", join(WORK, "bed.wav")]);
}
const mixM = A.ebur128(mixWav);
log(`mix.wav: ${mixM.I} LUFS, LRA ${mixM.LRA} LU, TP ${mixM.TP} dBTP`);

// ---------------- mux ----------------
let out = null, muxM = null, durations = null, sync = null, streams = null, windows = null;
if (video) {
  // --deliver: the final file with its captions; otherwise a draft, <name>-sound.mp4 / -voiceover.mp4.
  // The voiceover belongs on the captionless twin (build.mjs --no-captions): cues.json says which
  // picture this is ("captions": false); older cues without the field fall back to the name (-vo).
  const vb = basename(videoArg, ".mp4").replace(/\.picture-only$/, "");
  const captionless = cuesFile.captions === false || (cuesFile.captions == null && /-vo$/.test(vb));
  if (voArg && !captionless && !force) { console.error("error: the voiceover goes on the captionless picture (node film/build.mjs --no-captions, rendered as <name>-vo.mp4), not the captioned one; --force to mix anyway"); process.exit(1); }
  if (!voArg && captionless) warn("this picture was built without captions (the voiceover twin) but no --voiceover was given");
  out = deliverArg ?? cwdPath(opt("out")) ?? join(dirname(videoArg), vb + (voArg ? "-voiceover.mp4" : "-sound.mp4"));
  if (out === video) { console.error("error: output would overwrite the picture"); process.exit(1); }
  mkdirSync(dirname(out), { recursive: true });
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", video, "-i", mixWav, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", out]);
  muxM = A.ebur128(out);
  durations = { video: A.ffprobeDuration(out, "v:0"), audio: A.ffprobeDuration(out, "a:0") };
  durations.diffMs = r2((durations.audio - durations.video) * 1000);
  // proof the delivered file carries the sound: both streams, and loudness across the whole film in 10 s windows
  streams = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=index,codec_type,codec_name,profile,width,height,r_frame_rate,sample_rate,channels,channel_layout,bit_rate,duration,nb_frames", "-of", "json", out], { encoding: "utf8" })).streams;
  windows = [];
  for (let t = 0; t < D - 0.5; t += 10) {
    const d = Math.min(10, D - t);
    const r = spawnSync("ffmpeg", ["-nostats", "-hide_banner", "-ss", String(t), "-t", String(d), "-i", out, "-map", "0:a:0", "-af", "ebur128=framelog=quiet", "-f", "null", "-"], { encoding: "utf8" });
    const m = r.stderr.slice(r.stderr.lastIndexOf("Summary:")).match(/I:\s+(-?[\d.]+) LUFS/);
    const I = m ? parseFloat(m[1]) : NaN;
    const part = t + d <= fit.R + M.bar ? "music" : "release + fade";
    windows.push({ from: r3(t), to: r3(t + d), lufs: I, part, ok: part === "music" ? I >= CFG.lufs - 6 && I <= CFG.lufs + 4 : I > -45 });
  }
  log(`delivered-file loudness per 10 s: ${windows.map((w) => `${w.from}-${w.to}: ${w.lufs}`).join(", ")}`);
  if (captionsSrc) { copyFileSync(captionsSrc, out.replace(/\.mp4$/, ".srt")); log(`captions ${rel(captionsSrc)} -> ${rel(out.replace(/\.mp4$/, ".srt"))}`); }
  log(`muxed ${basename(out)}: ${muxM.I} LUFS, TP ${muxM.TP} dBTP; video ${durations.video.toFixed(3)} s, audio ${durations.audio.toFixed(3)} s (diff ${durations.diffMs} ms)`);
  // where the effects really land: decode the muxed track, take away the music, find each hit
  const got = A.decode(out);
  const res = A.alloc(Math.min(A.len(got), N));
  for (let i = 0; i < A.len(res); i++) { res.L[i] = got.L[i] - (music.L[i] + (voiceUsed ? voiceUsed.L[i] : 0)) * gN; res.R[i] = got.R[i] - (music.R[i] + (voiceUsed ? voiceUsed.R[i] : 0)) * gN; }
  sync = events.filter((e) => e.kind !== "riser").map((e) => {
    const f = fx[e.fx];
    const first = firstHit;
    const got = first(A.envelope(res, 0.0025, e.start - 0.02, e.start + f.dur));
    const ref = first(A.envelope(f.buf, 0.0025)); // the effect alone, as placed
    const around = A.envelope(res, 0.0025, e.at - 1, e.at + 1);
    const floor = around.db.filter((_, i) => Math.abs(around.t[i] - e.at) > 0.4).sort((p, q) => p - q);
    return {
      kind: e.kind, label: e.label, cue: r3(e.at), firstPeakAt: r3(got.peak), firstPeakVsCueMs: r2((got.peak - e.at) * 1000),
      placementErrMs: r2((got.peak - (e.start + ref.peak)) * 1000), onsetAt: r3(got.onset), onsetVsCueMs: r2((got.onset - e.at) * 1000),
      overResidualFloorDb: r2(got.pk - floor[floor.length >> 1]),
    };
  });
  // independent of the mix: band-pass the muxed track to 1.5-5 kHz (where the click lives and the
  // bed is 16 dB quieter) and find each click's first transient near its cue
  const bp = A.decode(out, "highpass=f=1500:p=2,highpass=f=1500:p=2,lowpass=f=5000:p=2,lowpass=f=5000:p=2");
  const clicksSeen = sync.filter((x) => x.kind === "click").map((x) => {
    const env = A.envelope(bp, 0.0025, x.cue - 0.06, x.cue + 0.06);
    const pk = env.t[env.db.indexOf(Math.max(...env.db))]; // the loudest 1.5-5 kHz transient within ±60 ms
    return { label: x.label, cue: x.cue, foundAt: r3(pk), errMs: r2((pk - x.cue) * 1000) };
  });
  const errs = clicksSeen.map((c) => Math.abs(c.errMs)).sort((p, q) => p - q); // a click that is not the loudest transient there shows up as a large error
  var bandCheck = { clicks: clicksSeen.length, medianAbsErrMs: errs[errs.length >> 1], maxAbsErrMs: errs[errs.length - 1], over1Frame: clicksSeen.filter((c) => Math.abs(c.errMs) > frame * 1000), sample: clicksSeen.filter((_, i) => i % 9 === 0) };
  log(`band-pass click check on the muxed file: ${bandCheck.clicks} clicks, median |error| ${bandCheck.medianAbsErrMs} ms, max ${bandCheck.maxAbsErrMs} ms, ${bandCheck.over1Frame.length} over a frame`);
  const worst = (k) => sync.reduce((w, s) => (Math.abs(s[k]) > Math.abs(w[k]) ? s : w), sync[0]);
  log(`effect hits found in the muxed audio: ${sync.length}; worst first-peak vs cue ${worst("firstPeakVsCueMs").firstPeakVsCueMs} ms (${worst("firstPeakVsCueMs").label}), worst onset vs cue ${worst("onsetVsCueMs").onsetVsCueMs} ms, worst placement error ${worst("placementErrMs").placementErrMs} ms; one frame = ${(frame * 1000).toFixed(1)} ms`);
}

// ---------------- voiceover ----------------
function readPlacement() {
  const pth = cwdPath(opt("placement")) ?? join(dirname(voArg), "placement.json");
  const pj = JSON.parse(readFileSync(pth, "utf8"));
  const arr = Array.isArray(pj) ? pj : pj.lines ?? pj.placements ?? pj.items ?? [];
  const num = (o, ks) => { for (const k of ks) if (typeof o[k] === "number") return o[k]; return NaN; };
  const lines = arr.map((l, i) => ({ id: l.id ?? i + 1, text: l.text, start: num(l, ["start", "filmStart", "film_start", "t0", "from", "at"]), end: num(l, ["end", "filmEnd", "film_end", "t1", "to"]) }));
  const bad = lines.filter((l) => !(l.end > l.start));
  if (!lines.length || bad.length) { console.error(`error: ${pth}: need lines with film start/end (found ${lines.length}, ${bad.length} unusable)`); process.exit(1); }
  return lines.sort((a, b) => a.start - b.start).map((l) => ({ ...l, placementFile: pth }));
}
function voiceover() {
  const lines = voLinesEarly;
  const raw = A.decode(voArg);
  const lengthDiffMs = r2((A.len(raw) / SR - D) * 1000);
  if (Math.abs(lengthDiffMs) > frame * 1000) warn(`voice track is ${(A.len(raw) / SR).toFixed(3)} s, the film ${D.toFixed(3)} s`);
  let v = A.alloc(N);
  for (let i = 0; i < Math.min(N, A.len(raw)); i++) { v.L[i] = raw.L[i]; v.R[i] = raw.R[i]; }
  // speech outside the placed lines would be ducked by nothing: measure it
  const inLine = (t) => lines.some((l) => t >= l.start - 0.05 && t <= l.end + 0.05);
  const envAll = A.envelope(v, 0.05);
  const strayDb = Math.max(-120, ...envAll.db.filter((_, i) => !inLine(envAll.t[i])));
  // low end: share of speech energy under the high-pass frequency
  const span = (buf) => { let a = 0; for (const l of lines) for (let i = Math.round(l.start * SR); i < Math.round(l.end * SR); i++) a += buf[i] * buf[i]; return a; };
  const mono = A.mono(v, 0, N);
  const lowShareDb = r2(10 * Math.log10(span(A.lowpassMono(A.lowpassMono(mono, CFG.vo.hpHz), CFG.vo.hpHz)) / span(mono)));
  const hp = lowShareDb > CFG.vo.hpIfLowShareDb;
  if (hp) v = { L: A.highpassMono(A.highpassMono(v.L, CFG.vo.hpHz), CFG.vo.hpHz), R: A.highpassMono(A.highpassMono(v.R, CFG.vo.hpHz), CFG.vo.hpHz) };
  // line levels and levelling toward the median
  let vk = A.kweight(v);
  const before = lines.map((l) => A.gatedLevelK(vk, l.start, l.end));
  const sorted = [...before].sort((a, b) => a - b), med = sorted[sorted.length >> 1];
  const spreadBefore = sorted[sorted.length - 1] - sorted[0];
  const lineGain = before.map((l) => (spreadBefore > CFG.vo.lineSpreadLU ? Math.max(-CFG.vo.maxLineGainDb, Math.min(CFG.vo.maxLineGainDb, med - l)) : 0));
  // the music in the groove, undducked, is the reference the voice is set against
  const grooveRef = A.gatedLevelK(musicKraw, Math.max(fit.groove, 10), Math.min(fit.R, D - 5));
  const gv = grooveRef + CFG.vo.voiceOverMusicDb - med;
  const gainAt = new Float32Array(N).fill(-120); // per-sample voice gain (dB): line gain inside a line, ramps in the silence round it
  lines.forEach((l, i) => { const a = Math.max(0, Math.round((l.start - 0.05) * SR)), b = Math.min(N, Math.round((l.end + 0.05) * SR)); for (let j = a; j < b; j++) gainAt[j] = gv + lineGain[i]; });
  // between lines keep the gain of the nearer line (the track is silent there, this only avoids steps)
  let last = gv; for (let j = 0; j < N; j++) { if (gainAt[j] === -120) gainAt[j] = last; else last = gainAt[j]; }
  for (let j = 0; j < N; j++) { const g = A.dbToGain(gainAt[j]); v.L[j] *= g; v.R[j] *= g; }
  vk = A.kweight(v);
  const after = lines.map((l) => A.gatedLevelK(vk, l.start, l.end));
  const voiceRef = [...after].sort((a, b) => a - b)[after.length >> 1];
  // the voice's loudest 100 ms per line (median): what a 100 ms effect is compared with
  const v100 = lines.map((l) => A.maxLevelK(vk, 0.1, l.start, l.end).level).sort((a, b) => a - b);
  const voice100 = v100[v100.length >> 1];
  // ducking: lines closer than mergeGap share one duck; depth puts the music musicUnderVoiceDb under the quietest line in the span
  const spans = [];
  lines.forEach((l, i) => { const s = spans[spans.length - 1]; if (s && l.start - s.end < CFG.vo.mergeGap) { s.end = l.end; s.lines.push(i); } else spans.push({ start: l.start, end: l.end, lines: [i] }); });
  const duckDb = new Float32Array(N);
  const rc = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
  // each line gets its own depth (music musicUnderVoiceDb under that line); inside a shared duck the depth
  // glides from one line's to the next across the gap, so nothing comes up between close lines
  const depth = lines.map((l, i) => Math.max(-CFG.vo.maxDuckDb, Math.min(0, after[i] - CFG.vo.musicUnderVoiceDb - A.levelK(musicKraw, l.start, l.end))));
  for (const sp of spans) {
    sp.depth = Math.min(...sp.lines.map((i) => depth[i]));
    sp.depths = sp.lines.map((i) => r2(depth[i]));
    const first = sp.lines[0], lastI = sp.lines[sp.lines.length - 1];
    const a0 = sp.start - CFG.vo.attackLead - CFG.vo.attack, a1 = sp.start - CFG.vo.attackLead, r0 = sp.end + CFG.vo.releaseLag, r1 = r0 + CFG.vo.release;
    sp.attackFrom = r3(a0); sp.releasedAt = r3(r1);
    const target = (t) => { // the depth wanted at t inside the span
      for (let k = 0; k < sp.lines.length; k++) {
        const l = lines[sp.lines[k]];
        if (t <= l.end) {
          if (k === 0 || t >= l.start) return depth[sp.lines[k]];
          const p = lines[sp.lines[k - 1]]; // in the gap before line k
          return depth[sp.lines[k - 1]] + (depth[sp.lines[k]] - depth[sp.lines[k - 1]]) * rc((t - p.end) / (l.start - p.end));
        }
      }
      return depth[lastI];
    };
    for (let j = Math.max(0, Math.floor(a0 * SR)); j < Math.min(N, Math.ceil(r1 * SR)); j++) {
      const t = j / SR;
      const d = t < a1 ? depth[first] * rc((t - a0) / CFG.vo.attack) : t > r0 ? depth[lastI] * (1 - rc((t - r0) / CFG.vo.release)) : target(t);
      if (d < duckDb[j]) duckDb[j] = d;
    }
  }
  for (let j = 0; j < N; j++) { const g = A.dbToGain(duckDb[j]); music.L[j] *= g; music.R[j] *= g; }
  const gapsUp = spans.slice(1).map((sp, i) => ({ from: spans[i].releasedAt, to: sp.attackFrom, fullLevelFor: r2(sp.attackFrom - spans[i].releasedAt) }));
  return { voice: v, VO: { lines, spans, before, after, lineGain, gv, hp, lowShareDb, strayDb: r2(strayDb), lengthDiffMs, voiceRef, voice100, grooveRef, duckDb, gapsUp } };
}
function voiceReport() {
  const vk = A.kweight(voiceUsed), mk = A.kweight(music);
  const g = 20 * Math.log10(gN);
  const lines = VO.lines.map((l, i) => {
    const v = A.gatedLevelK(vk, l.start, l.end) + g, m = A.levelK(mk, l.start, l.end) + g;
    return { id: l.id, start: l.start, end: l.end, voiceLufs: r2(v), musicUnderLufs: r2(m), voiceOverMusicDb: r2(v - m), lineGainDb: r2(VO.lineGain[i]) };
  });
  const vs = lines.map((l) => l.voiceLufs).sort((a, b) => a - b), d = lines.map((l) => l.voiceOverMusicDb).sort((a, b) => a - b);
  const spreadBefore = Math.max(...VO.before) - Math.min(...VO.before);
  // the music between ducks: level in the middle of each gap long enough to come all the way back, vs the bed there undducked
  const gaps = VO.gapsUp.filter((x) => x.fullLevelFor > 1).map((x) => { const a = x.from + 0.2, b = x.to - 0.2; return { from: x.from, to: x.to, musicLufs: r2(A.levelK(mk, a, b) + g), vsUndducked: r2(A.levelK(mk, a, b) - A.levelK(musicKraw, a, b)) }; });
  return {
    track: voArg, placement: VO.lines[0].placementFile, srt: captionsSrc, lengthDiffMs: VO.lengthDiffMs,
    highPass: VO.hp ? `${CFG.vo.hpHz} Hz, 24 dB/oct` : "none", energyUnderHpDb: VO.lowShareDb, speechOutsideLinesPeakDb: VO.strayDb,
    lineSpreadBeforeLU: r2(spreadBefore), lineSpreadLU: r2(vs[vs.length - 1] - vs[0]), levelled: spreadBefore > CFG.vo.lineSpreadLU,
    voiceMedianLufs: r2(vs[vs.length >> 1]), voiceLoudest100msMedian: r2(VO.voice100 + g), voiceOverMusic: { min: d[0], median: d[d.length >> 1], max: d[d.length - 1] },
    limiter: { peaksLimited: voLimit.limited, maxReductionDb: r2(voLimit.maxReductionDb) },
    ducks: VO.spans.map((s) => ({ from: s.attackFrom, lines: s.lines.length, depthDb: r2(s.depth), lineDepthsDb: s.depths, releasedAt: s.releasedAt })),
    extraPeakMarginDb: VO_MARGIN,
    gaps, lines,
  };
}

// ---------------- report ----------------
const levels = events.map((e) => { const f = fx[e.fx], g = e.gainDb + e.capDb; return { t: r3(e.at), kind: e.kind, fx: e.fx, label: e.label, setBy: CFG.over[e.kind].measure, peakOverBedDb: r2(f.tp + g - e.bedPeak), loudOverBedDb: r2((CFG.over[e.kind].win === 0.4 ? f.l400 : f.l100).level + g - e.bedWin), pulledDownDb: r2(e.capDb), gainDb: r2(g + norm), ...(e.dipDb ? { dipDb: e.dipDb } : {}), ...(VO ? { voiceoverDb: r2(e.voDb), loudest100msVsVoiceLoudest100msDb: r2(f.l100.level + g - VO.voice100) } : {}) }; });
const voReport = VO ? voiceReport() : null;
// whoosh vs music in the whoosh's own band (150-1000 Hz, where 99% of its energy is), over its loudest 100 ms
for (const l of levels) if (l.kind === "whoosh") {
  const e = events.find((x) => x.kind === "whoosh" && r3(x.at) === l.t), f = fx[e.fx], g = A.dbToGain(e.gainDb + e.capDb + norm);
  const c = e.start + f.l100.at, a = Math.round((c - 0.15) * SR), b = Math.round((c + 0.15) * SR), w0 = Math.round(0.1 * SR), w1 = Math.round(0.2 * SR);
  const bandOf = (x) => A.lowpassMono(A.lowpassMono(A.highpassMono(A.highpassMono(x, 150), 150), 1000), 1000).slice(w0, w1);
  const st = Math.round(e.start * SR), wh = new Float32Array(b - a);
  for (let i = a; i < b; i++) { const j = i - st; if (j >= 0 && j < A.len(f.buf)) wh[i - a] = 0.5 * (f.buf.L[j] + f.buf.R[j]) * g; }
  const mu = A.mono(music, a, b).map((v) => v * gN);
  const p = (x) => 10 * Math.log10(x.reduce((q, v) => q + v * v, 0) / x.length + 1e-20);
  l.bandOverMusicDb = r2(p(bandOf(wh)) - p(bandOf(mu)));
}
for (const l of levels) if (l.kind === "whoosh") log(`whoosh ${l.t} (${l.label}): ${l.loudOverBedDb >= 0 ? "+" : ""}${l.loudOverBedDb} dB over the music in its loudest 100 ms (K-weighted), ${l.bandOverMusicDb >= 0 ? "+" : ""}${l.bandOverMusicDb} dB in 150-1000 Hz${l.dipDb ? ` (music dipped ${l.dipDb} dB)` : ""}${l.pulledDownDb ? `, pulled ${l.pulledDownDb} dB for peaks` : ""}`);
for (const l of levels) if (l.kind === "whoosh" && l.loudOverBedDb < -1) warn(`whoosh at ${l.t} (${l.label}) ends ${l.loudOverBedDb} dB under the music there (peak headroom${VO ? " and the voice rule" : ""}): it may not be heard`);
const report = {
  built: new Date().toISOString(), video: video && basename(video), out: out && basename(out), filmDuration: r3(D), warnings: warns,
  music: { file: rel(M.audio), bpm: M.bpm, loopsAdded: fit.k, startOffset: fit.s, finalChordAt: r3(fit.R), finalChordVsWipeCut: r3(fit.dev), endWipeCut: r3(markCut), grooveEntersAt: r3(fit.groove), titleEnds: titleEnd, bedMin },
  joins, effects: Object.fromEntries(Object.entries(fx).map(([k, f]) => [k, { loudest100ms: r2(f.l100.level), loudest400ms: r2(f.l400.level), hitAt: r3(f.hit), duration: r3(f.dur), samplePeakDb: r2(f.tp), note: f.note }])),
  whooshDips: dips, voiceover: voReport, droppedClicks: voArg ? droppedClicks : undefined,
  events: levels, streams, loudnessWindows: windows, captions: captionsSrc, musicAlone: raw, bandCheck: typeof bandCheck === "undefined" ? null : bandCheck, normGainDb: r2(norm), mixWav: mixM, muxed: muxM, durations, sync,
};
writeFileSync(join(WORK, `last-build${TAG}.json`), JSON.stringify(report, null, 1) + "\n");
const fail = [];
if (!(Math.abs((muxM ?? mixM).I - CFG.lufs) <= 0.5)) fail.push(`loudness ${(muxM ?? mixM).I} LUFS`);
if (!((muxM ?? mixM).TP <= CFG.maxTruePeak)) fail.push(`true peak ${(muxM ?? mixM).TP} dBTP`);
if (durations && Math.abs(durations.diffMs) > frame * 1000) fail.push(`audio/video length differ by ${durations.diffMs} ms`);
if (video && !(streams ?? []).some((x) => x.codec_type === "audio" && Math.abs(parseFloat(x.duration) - D) <= frame)) fail.push("delivered file has no full-length audio stream");
if (windows && windows.some((w) => !w.ok)) fail.push(`loudness out of range in ${windows.filter((w) => !w.ok).map((w) => `${w.from}-${w.to}`).join(", ")}`);
if (deliverArg && !captionsSrc) fail.push(voArg ? "no voiceover .srt (one .srt beside the voice track, or --srt)" : "no captions for this build (pass --srt or save <name>.captions.srt beside the render)");
if (voReport) {
  if (voReport.lineSpreadLU > CFG.vo.lineSpreadLU + 0.05) fail.push(`voice lines spread ${voReport.lineSpreadLU} LU`);
  if (voReport.voiceOverMusic.min < CFG.vo.musicUnderVoiceDb - 3) fail.push(`music only ${voReport.voiceOverMusic.min} dB under the voice in a line`);
  if (levels.some((l) => l.loudest100msVsVoiceLoudest100msDb > 0.05)) fail.push("an effect is louder than the voice");
  if (voReport.lengthDiffMs != null && Math.abs(voReport.lengthDiffMs) > frame * 1000) fail.push(`voice track is ${voReport.lengthDiffMs} ms off the film length`);
}
// a hit lands by its first transient (clicks: also their onset); a whoosh's swell starts earlier by design
if (sync && sync.some((s) => Math.abs(s.firstPeakVsCueMs) > frame * 1000 || (s.kind === "click" && Math.abs(s.onsetVsCueMs) > frame * 1000))) fail.push(`an effect lands more than a frame off its cue`);
for (const j of joins) if (j.clickRatio >= 1 || (j.gridShiftMs != null && Math.abs(j.gridShiftMs) > 5) || Math.min(Math.abs(j.levelStep - j.levelStepNatural), Math.abs(j.levelStep - j.levelStepNaturalAtB)) > 1.5) fail.push(`join at ${j.film} measures rough`);
if (voArg && muxM && muxM.TP > CFG.maxTruePeak && VO_MARGIN < 4 && fail.length === 1) { // only the true peak failed: again with more margin
  const next = r2(VO_MARGIN + (muxM.TP - CFG.maxTruePeak) + 0.3);
  log(`encoded true peak ${muxM.TP} dBTP: building again with ${next} dB more peak margin`);
  // the same command, pointed at the (possibly renamed) picture
  const again = process.argv.slice(1).map((a, i, all) => (all[i - 1] === "--video" ? videoArg : a));
  const r = spawnSync(process.execPath, again, { stdio: "inherit", env: { ...process.env, SOUND_VO_MARGIN: String(next) } });
  process.exit(r.status ?? 1);
}
log(fail.length ? `CHECKS FAILED: ${fail.join("; ")}` : "all checks passed");
log(`wrote ${[`beat-grid${TAG}.json`, `last-build${TAG}.json`, ...(voArg ? [] : ["bed.wav"]), `mix${TAG}.wav`].map((f) => rel(join(WORK, f))).join(", ")}${out ? `, ${rel(out)}` : ""}`);
log(out ? (fail.length ? `NOT DELIVERED (checks failed): ${out}` : `delivered: ${out}`) : "no video given: nothing delivered");
process.exit(fail.length ? 2 : 0);
