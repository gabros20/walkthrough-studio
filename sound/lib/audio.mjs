// Small audio toolkit for the sound build: ffmpeg for decode/encode/loudness, plain JS for the rest.
// All buffers are 48 kHz stereo, { L: Float32Array, R: Float32Array }.
import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

export const SR = 48000;

export function ffprobeDuration(file, stream = null) {
  const args = ["-v", "error"];
  if (stream) args.push("-select_streams", stream, "-show_entries", "stream=duration");
  else args.push("-show_entries", "format=duration");
  args.push("-of", "default=nw=1:nk=1", file);
  return parseFloat(execFileSync("ffprobe", args, { encoding: "utf8" }).trim().split("\n")[0]);
}

export function ffprobeFrames(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=nb_frames,r_frame_rate", "-of", "json", file], { encoding: "utf8" });
  const s = JSON.parse(out).streams[0];
  const [n, d] = s.r_frame_rate.split("/").map(Number);
  return { frames: +s.nb_frames, fps: n / d };
}

/** Decode any file to 48 kHz stereo float, optionally through an ffmpeg audio filter chain. */
export function decode(file, filter = null) {
  const args = ["-v", "error", "-i", file];
  if (filter) args.push("-af", filter);
  args.push("-f", "f32le", "-ac", "2", "-ar", String(SR), "-");
  const r = spawnSync("ffmpeg", args, { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg decode failed for ${file}: ${r.stderr}`);
  const f = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 4);
  const n = f.length / 2;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = f[2 * i]; R[i] = f[2 * i + 1]; }
  return { L, R };
}

export function alloc(n) { return { L: new Float32Array(n), R: new Float32Array(n) }; }
export const len = (b) => b.L.length;

/** Write a 32-bit float stereo WAV. */
export function writeWavF32(path, buf) {
  const n = len(buf), data = Buffer.alloc(n * 8);
  for (let i = 0; i < n; i++) { data.writeFloatLE(buf.L[i], 8 * i); data.writeFloatLE(buf.R[i], 8 * i + 4); }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 8, 28); h.writeUInt16LE(8, 32); h.writeUInt16LE(32, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
  writeFileSync(path, Buffer.concat([h, data]));
}

/** Integrated loudness, loudness range and true peak by ffmpeg's ebur128 (BS.1770-4). */
export function ebur128(file) {
  const r = spawnSync("ffmpeg", ["-nostats", "-hide_banner", "-i", file, "-map", "0:a:0", "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"], { encoding: "utf8", maxBuffer: 1 << 28 });
  const s = r.stderr.slice(r.stderr.lastIndexOf("Summary:"));
  const num = (re) => { const m = s.match(re); return m ? parseFloat(m[1]) : NaN; };
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/True peak:\s+Peak:\s+(-?[\d.inf]+) dBFS/) };
}

// ---------- K-weighting (BS.1770 at 48 kHz) and levels ----------
function biquad(x, b, a) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
const K1 = { b: [1.53512485958697, -2.69169618940638, 1.19839281085285], a: [1, -1.69065929318241, 0.73248077421585] };
const K2 = { b: [1, -2, 1], a: [1, -1.99004745483398, 0.99007225036621] };
/** K-weighted copy (for level comparisons in LUFS-like units). */
export function kweight(buf) {
  const f = (x) => biquad(biquad(x, K1.b, K1.a), K2.b, K2.a);
  return { L: f(buf.L), R: f(buf.R) };
}
/** Level of [t0, t1) in a K-weighted buffer, LUFS-like (-0.691 + 10 log10 of summed channel power). */
export function levelK(kb, t0, t1) {
  const a = Math.max(0, Math.round(t0 * SR)), b = Math.min(len(kb), Math.round(t1 * SR));
  if (b <= a) return -Infinity;
  let s = 0;
  for (let i = a; i < b; i++) s += kb.L[i] * kb.L[i] + kb.R[i] * kb.R[i];
  return -0.691 + 10 * Math.log10(s / (b - a) + 1e-20);
}
/** Max level over sliding windows of `win` s (hop 5 ms) and where it is (window centre). */
export function maxLevelK(kb, win = 0.1, t0 = 0, t1 = len(kb) / SR) {
  let best = -Infinity, at = t0;
  for (let t = t0; t + win <= t1 + 1e-9; t += 0.005) {
    const l = levelK(kb, t, t + win);
    if (l > best) { best = l; at = t + win / 2; }
  }
  return { level: best, at };
}
/** RMS envelope (mono power sum) in hops of `hop` s; returns { t[], db[] } (t = frame centre). */
export function envelope(buf, hop = 0.005, t0 = 0, t1 = len(buf) / SR) {
  const H = Math.round(hop * SR), a = Math.round(t0 * SR), b = Math.min(len(buf), Math.round(t1 * SR));
  const t = [], db = [];
  for (let i = a; i + H <= b; i += H) {
    let s = 0;
    for (let j = i; j < i + H; j++) s += buf.L[j] * buf.L[j] + buf.R[j] * buf.R[j];
    t.push((i + H / 2) / SR); db.push(10 * Math.log10(s / (2 * H) + 1e-20));
  }
  return { t, db };
}
export function samplePeakDb(buf, t0 = 0, t1 = len(buf) / SR) {
  let m = 0;
  for (let i = Math.max(0, Math.round(t0 * SR)); i < Math.min(len(buf), Math.round(t1 * SR)); i++) m = Math.max(m, Math.abs(buf.L[i]), Math.abs(buf.R[i]));
  return 20 * Math.log10(m + 1e-20);
}
export const dbToGain = (db) => Math.pow(10, db / 20);

// ---------- FFT and 1/3-octave band levels ----------
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const ang = (-2 * Math.PI) / size, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let s = 0; s < n; s += size) {
      let cr = 1, ci = 0;
      for (let k = 0; k < size / 2; k++) {
        const a = s + k, b = a + size / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
const N_FFT = 1024;
const HANN = Float32Array.from({ length: N_FFT }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT));
const BANDS = (() => { const c = []; for (let f = 50; f <= 16000; f *= Math.pow(2, 1 / 3)) c.push(f); return c.map((f) => [f / Math.pow(2, 1 / 6), f * Math.pow(2, 1 / 6)]); })();
/** 1/3-octave band levels (dB) of the 1024-sample frame starting at sample `i0` (mono sum). */
export function bandFrame(buf, i0) {
  const re = new Float64Array(N_FFT), im = new Float64Array(N_FFT);
  for (let j = 0; j < N_FFT; j++) { const k = i0 + j; re[j] = k >= 0 && k < len(buf) ? 0.5 * (buf.L[k] + buf.R[k]) * HANN[j] : 0; }
  fft(re, im);
  return BANDS.map(([lo, hi]) => {
    let s = 0;
    const a = Math.max(1, Math.floor((lo * N_FFT) / SR)), b = Math.min(N_FFT / 2, Math.ceil((hi * N_FFT) / SR));
    for (let k = a; k < b; k++) s += re[k] * re[k] + im[k] * im[k];
    return 10 * Math.log10(s + 1e-12);
  });
}
/** Mean absolute band difference (dB) between two lists of band frames. */
export function bandDist(A, B) {
  let s = 0, n = 0;
  for (let i = 0; i < Math.min(A.length, B.length); i++) for (let j = 0; j < A[i].length; j++) { s += Math.abs(A[i][j] - B[i][j]); n++; }
  return s / n;
}
/** Band frames covering [t0, t0 + count * hop) with hop 512 samples. */
export function bandFrames(buf, t0, count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(bandFrame(buf, Math.round(t0 * SR) + i * 512));
  return out;
}

/** One-pole-pair low-pass (2nd order Butterworth) of a mono signal, for phase checks. */
export function lowpassMono(x, fc) {
  const w = Math.tan((Math.PI * fc) / SR), q = Math.SQRT1_2;
  const n = 1 / (1 + w / q + w * w);
  const b = [w * w * n, 2 * w * w * n, w * w * n], a = [1, 2 * (w * w - 1) * n, (1 - w / q + w * w) * n];
  return biquad(x, b, a);
}
export function corr(x, y) {
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0; const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; syy += y[i] * y[i]; sxy += x[i] * y[i]; }
  const cov = sxy / n - (sx / n) * (sy / n), vx = sxx / n - (sx / n) ** 2, vy = syy / n - (sy / n) ** 2;
  return cov / Math.sqrt(vx * vy + 1e-30);
}
export const mono = (buf, a, b) => { const o = new Float32Array(b - a); for (let i = a; i < b; i++) o[i - a] = 0.5 * (buf.L[i] + buf.R[i]); return o; };

/** 2nd-order Butterworth high-pass of a mono signal. */
export function highpassMono(x, fc) {
  const w = Math.tan((Math.PI * fc) / SR), q = Math.SQRT1_2;
  const n = 1 / (1 + w / q + w * w);
  const b = [n, -2 * n, n], a = [1, 2 * (w * w - 1) * n, (1 - w / q + w * w) * n];
  return biquad(x, b, a);
}
/** Gated level (BS.1770 style: 400 ms blocks, 75% overlap, -70 absolute and -10 relative gates) of [t0, t1) in a K-weighted buffer. */
export function gatedLevelK(kb, t0, t1) {
  if (t1 - t0 < 0.4) return levelK(kb, t0, t1);
  const bl = [];
  for (let t = t0; t + 0.4 <= t1 + 1e-9; t += 0.1) bl.push(levelK(kb, t, t + 0.4));
  const pm = (v) => -0.691 + 10 * Math.log10(v.reduce((s, l) => s + Math.pow(10, (l + 0.691) / 10), 0) / v.length);
  const a = bl.filter((l) => l > -70);
  if (!a.length) return -Infinity;
  const rel = pm(a) - 10;
  const g = a.filter((l) => l > rel);
  return pm(g.length ? g : a);
}
/** Look-ahead peak limiter on a stereo buffer: returns { buf, limited, maxReductionDb }. Only acts round samples over `thr` (linear). */
export function limitPeaks(buf, thr, look = 0.005, release = 0.08) {
  const n = len(buf), La = Math.round(look * SR), Lr = release * SR;
  const g = new Float32Array(n).fill(1);
  let limited = 0, maxRed = 1;
  const amp = (i) => Math.max(Math.abs(buf.L[i]), Math.abs(buf.R[i]));
  for (let i = 1; i < n - 1; i++) {
    const a = amp(i);
    if (a <= thr || a < amp(i - 1) || a < amp(i + 1)) continue; // local peaks over the threshold
    const need = thr / a; limited++; maxRed = Math.min(maxRed, need);
    for (let j = Math.max(0, i - La); j <= i; j++) { const v = 1 - (1 - need) * ((j - (i - La)) / La); if (v < g[j]) g[j] = v; }
    for (let j = i + 1; j < Math.min(n, i + Math.round(5 * Lr)); j++) { const v = 1 - (1 - need) * Math.exp(-(j - i) / Lr); if (v < g[j]) g[j] = v; else if (v > 0.9999) break; }
  }
  const out = alloc(n);
  for (let i = 0; i < n; i++) { out.L[i] = buf.L[i] * g[i]; out.R[i] = buf.R[i] * g[i]; }
  return { buf: out, limited, maxReductionDb: 20 * Math.log10(maxRed) };
}
