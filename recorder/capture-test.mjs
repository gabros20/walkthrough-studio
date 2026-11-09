// Capture-quality test: records the frame-counter page with a capture method and measures the
// decoded master. Usage:
//   node capture-test.mjs <mode:new|shell|headed> <scale:2|1.5> <phase:idle|load|drift> [seconds]
// Writes <takesDir>/_capture-test/<mode>-<scale>x-<phase>/ ($WALKTHROUGH_TAKES, else <repo>/takes) and
// prints a JSON result line. The pass table is in docs/CAPTURE_TEST.md.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import { decodeFrames, probe } from "./capture.mjs";
import { defaultTakesDir, openSession } from "./take.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const [mode = "new", scaleArg = "2", phase = "idle", secondsArg] = process.argv.slice(2);
const scale = Number(scaleArg);
const seconds = Number(secondsArg ?? (phase === "idle" ? 30 : phase === "load" ? 60 : 300));
const fps = 60;
const name = `${mode}-${scale}x-${phase}`;
const dir = path.join(defaultTakesDir(), "_capture-test", name);

// CPU pressure outside the browser during the load phase (real takes share the machine with the
// app's own servers): two threads at about 60% duty.
const hogs = [];
if (phase === "load") {
  for (let i = 0; i < 2; i++)
    hogs.push(
      new Worker(
        "setInterval(()=>{const e=performance.now()+30;let x=0;while(performance.now()<e)x+=Math.sqrt(x+1)},50)",
        { eval: true },
      ),
    );
}

const session = await openSession({ mode, scale });
const url = pathToFileURL(path.join(here, "pages", "counter.html")).href + (phase === "load" ? "#load" : "");
await session.page.goto(url);
await session.page.waitForTimeout(phase === "load" ? 4000 : 1500);
const take = await session.startTake(name, { dir, fps, overwrite: true });
const rss = { startMB: Math.round(process.memoryUsage().rss / 1e6), maxMB: 0 };
const rssTimer = setInterval(() => {
  rss.maxMB = Math.max(rss.maxMB, Math.round(process.memoryUsage().rss / 1e6));
}, 2000);
const rafStart = await session.page.evaluate(() => window.__frames());
const t0 = performance.now();
await take.hold(seconds);
const rafEnd = await session.page.evaluate(() => window.__frames());
const pageFps = (rafEnd - rafStart) / ((performance.now() - t0) / 1000);
clearInterval(rssTimer);
rss.endOfCaptureMB = Math.round(process.memoryUsage().rss / 1e6);
const summary = await take.finish({ preset: "medium" });
for (const h of hogs) await h.terminate();
await session.close();

// ---- measure the decoded master
const master = path.join(dir, "master.mp4");
const info = await probe(master);
const W = Number(info.width);
const k = W / 1440; // device px per CSS px
const blockDev = Math.round(40 * k);
const stripW = Math.round(26 * 40 * k);
const OUT_BLOCK = 10;
const counters = [];
await decodeFrames(
  master,
  { width: 26 * OUT_BLOCK, height: OUT_BLOCK, pix: "gray", vf: `crop=${stripW}:${blockDev}:0:0` },
  (buf) => {
    const val = (b) => {
      let s = 0;
      for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) s += buf[y * 26 * OUT_BLOCK + b * OUT_BLOCK + x];
      return s / 16;
    };
    const black = val(0);
    const white = val(1);
    if (black > 70 || white < 185) return counters.push(null);
    const mid = (black + white) / 2;
    let n = 0;
    for (let b = 0; b < 24; b++) n = n * 2 + (val(2 + b) < mid ? 1 : 0);
    counters.push(n);
  },
);

// Window between the two flashes (exclusive of the flashes themselves).
const from = Math.ceil((summary.sync.startT + 0.25) * fps);
const to = Math.floor((summary.sync.endT - 0.1) * fps);
const perSecond = [];
for (let s = from; s + fps <= to; s += fps) {
  const set = new Set();
  for (let i = s; i < s + fps; i++) if (counters[i] !== null) set.add(counters[i]);
  perSecond.push(set.size);
}
const sortedPS = [...perSecond].sort((a, b) => a - b);
let longestRun = 0;
let run = 0;
let unreadable = 0;
let backwards = 0;
for (let i = from; i <= to; i++) {
  if (counters[i] === null) {
    unreadable++;
    continue;
  }
  if (i > from && counters[i] === counters[i - 1]) run++;
  else run = 1;
  if (i > from && counters[i - 1] !== null && counters[i] < counters[i - 1]) backwards++;
  longestRun = Math.max(longestRun, run);
}

// Reference red patch (#F01020): 200x200 CSS at (40,100); sample the central 120x120 CSS of one mid frame.
const crop = `crop=${Math.round(120 * k)}:${Math.round(120 * k)}:${Math.round(80 * k)}:${Math.round(140 * k)}`;
const red = { mean: [0, 0, 0], maxDev: [0, 0, 0] };
let px = 0;
const midT = (summary.sync.startT + summary.sync.endT) / 2;
await decodeFrames(master, { width: Math.round(120 * k), height: Math.round(120 * k), pix: "rgb24", vf: crop, ss: midT, frames: 1 }, (buf) => {
  if (px) return;
  for (let i = 0; i < buf.length; i += 3) {
    for (let c = 0; c < 3; c++) {
      red.mean[c] += buf[i + c];
      red.maxDev[c] = Math.max(red.maxDev[c], Math.abs(buf[i + c] - [240, 16, 32][c]));
    }
    px++;
  }
});
red.mean = red.mean.map((v) => Math.round((v / px) * 10) / 10);

const expectW = Math.round(1440 * scale);
const expectH = Math.round(810 * scale);
const result = {
  name,
  mode,
  scale,
  phase,
  seconds,
  browser: summary.browser,
  pageRafFps: Math.round(pageFps * 10) / 10,
  frameSize: `${info.width}x${info.height}`,
  frameSizePass: Number(info.width) === expectW && Number(info.height) === expectH,
  masterFrames: Number(info.nb_read_packets),
  delivery: {
    fps: Math.round(summary.capture.deliveredFps * 10) / 10,
    gapMedianMs: Math.round(summary.capture.deliveryGapMedianMs * 10) / 10,
    gapP99Ms: Math.round(summary.capture.deliveryGapP99Ms * 10) / 10,
    gapMaxMs: Math.round(summary.capture.deliveryGapMaxMs * 10) / 10,
  },
  uniquePerSecond: {
    median: sortedPS[sortedPS.length >> 1],
    min: sortedPS[0],
    p10: sortedPS[Math.floor(sortedPS.length * 0.1)],
    windows: sortedPS.length,
  },
  longestGapMs: Math.round((longestRun / fps) * 1000 * 10) / 10,
  unreadableFrames: unreadable,
  counterWentBackwards: backwards,
  sync: summary.sync,
  masterSync: summary.masterSync,
  red,
  redPass: red.maxDev.every((d) => d <= 3),
  rawMB: Math.round(summary.capture.bytes / 1e5) / 10,
  recorderRss: rss,
  encodeFrames: summary.encode.frames,
  masterMB: Math.round(Number(info.size) / 1e5) / 10,
};
const minUnique = phase === "load" ? 50 : 57;
result.uniquePass = result.uniquePerSecond.median >= minUnique;
result.gapPass = result.longestGapMs <= 100;
result.syncPass = Math.abs(summary.sync.driftFrames) <= 1 && summary.masterSync.pass;
fs.writeFileSync(path.join(dir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result));
