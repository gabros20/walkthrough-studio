// Re-map a take's event times with the segment latency model (see Take.finish): start-flash latency
// before the longest wait (>= 5 s), end-flash latency after it, linear across it; linear across the
// take when there is no such wait. Only the log changes; the footage is untouched.
// Usage: node recorder/retime.mjs <takeDir>
import fs from "node:fs";
import path from "node:path";
import { verifyMasterSync } from "./take.mjs";

const dir = process.argv[2];
const takeFile = path.join(dir, "take.json");
const evFile = path.join(dir, "events.json");
const take = JSON.parse(fs.readFileSync(takeFile, "utf8"));
const doc = JSON.parse(fs.readFileSync(evFile, "utf8"));
if (take.retimed) {
  console.log("already retimed");
  process.exit(0);
}
const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;
const median = (a) => {
  const b = [...a].sort((x, y) => x - y);
  return b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2;
};
const fps = take.fps;
const T0 = take.T0;
const Lold = take.L;
const toW = (t) => t + T0 - Lold; // inverse of the old single-latency mapping
const fl = take.sync.flashes;
const Ls = median(fl.filter((f) => f.label.startsWith("start")).map((f) => f.latencyMs / 1000));
const Le = median(fl.filter((f) => f.label.startsWith("end")).map((f) => f.latencyMs / 1000));
const starts = take.flashWall.starts;
const ends = take.flashWall.ends;
let wA = median(starts);
let wB = median(ends);
const ev = doc.events;
const waits = [];
for (const e of ev) if (e.type === "waitStart") {
  const end = ev.find((x) => x.type === "waitEnd" && x.label === e.label);
  if (end && end.t - e.t >= 5) waits.push([toW(e.t), toW(end.t)]);
}
if (waits.length) [wA, wB] = waits.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
const latencyAt = (w) => (w <= wA ? Ls : w >= wB ? Le : Ls + ((Le - Ls) * (w - wA)) / (wB - wA));
const toT = (w) => r4(w - T0 + latencyAt(w));
const re = (t) => toT(toW(t));
for (const e of ev) {
  if (e.type === "sync") continue;
  e.t = re(e.t);
  if (e.tEnd !== undefined) e.tEnd = re(e.tEnd);
  if (e.chars) e.chars = e.chars.map(re);
}
const flashWs = [...starts, ...ends];
const syncEv = ev.filter((e) => e.type === "sync");
syncEv.forEach((e, i) => {
  e.predicted = toT(flashWs[i]);
});
ev.sort((a, b) => a.t - b.t);
ev.forEach((e, i) => {
  e.id = i;
});
const ms = await verifyMasterSync(path.join(dir, "master.mp4"), fps, flashWs.map(toT));
// Held flashes (onset hidden behind the previous flash on a static page) are left out, as in take.mjs.
const errsOf = (list) => list.filter((f) => !f.held).map((f) => f.errorFrames);
const errs = errsOf(ms.flashes);
ms.startMedianErrorFrames = r2(median(errsOf(ms.flashes.slice(0, starts.length))));
ms.endMedianErrorFrames = r2(median(errsOf(ms.flashes.slice(starts.length))));
ms.pass = Math.abs(ms.startMedianErrorFrames) <= 1 && Math.abs(ms.endMedianErrorFrames) <= 1 && errs.every((e) => Math.abs(e) <= 2);
take.masterSyncSingleLatency = take.masterSync;
take.masterSync = ms;
take.sync.startLatencyMs = r2(Ls * 1000);
take.sync.endLatencyMs = r2(Le * 1000);
take.sync.latencyChangeFrames = r2((Le - Ls) * fps);
take.sync.latencyModel = waits.length ? "step across the longest wait" : "linear across the take";
take.latency = { Ls, Le, wA, wB };
take.retimed = { at: new Date().toISOString(), from: "single median latency", to: take.sync.latencyModel };
fs.writeFileSync(evFile, `${JSON.stringify(doc, null, 2)}\n`);
fs.writeFileSync(takeFile, `${JSON.stringify(take, null, 2)}\n`);
console.log(JSON.stringify({ pass: ms.pass, start: ms.startMedianErrorFrames, end: ms.endMedianErrorFrames, errs, latencyChangeFrames: take.sync.latencyChangeFrames, model: take.sync.latencyModel }));
