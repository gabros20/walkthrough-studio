// Read-back helpers for a finished take: a contact sheet of stills at the logged moments, and
// unique frames per second split by agent waits. Used by run.mjs after every take.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const readJson = (f) => JSON.parse(fs.readFileSync(f, "utf8"));

/** The take's latency model as a function of wall time (see docs/CONTRACT.md, section 3). */
export function latencyFn(take) {
  const { Ls, Le, wA, wB } = take.latency;
  return (w) => (w <= wA ? Ls : w >= wB ? Le : Ls + ((Le - Ls) * (w - wA)) / (wB - wA));
}

/** Wait ranges [t, tEnd] on the master clock, optionally only those at least minSeconds long. */
export function waitRanges(events, minSeconds = 0) {
  const out = [];
  for (const e of events)
    if (e.type === "waitStart") {
      const end = events.find((x) => x.type === "waitEnd" && x.label === e.label);
      if (end && end.t - e.t >= minSeconds) out.push([e.t, end.t]);
    }
  return out;
}

/**
 * Up to 20 stills (marks, clicks, 1 s after each wait) tiled into verify/sheet.jpg, with
 * verify/stills.txt listing time and label per still.
 */
export function contactSheet(dir) {
  const ev = readJson(path.join(dir, "events.json")).events;
  const picks = [];
  for (const e of ev) {
    if (e.type === "mark" || e.type === "down") picks.push({ t: e.t + 0.05, label: `${e.type} ${e.label}` });
    if (e.type === "waitEnd") picks.push({ t: e.t + 1.0, label: `after ${e.label}` });
  }
  const step = Math.max(1, Math.ceil(picks.length / 20));
  const chosen = picks.filter((_, i) => i % step === 0).slice(0, 20);
  const sd = path.join(dir, "verify", "stills");
  fs.rmSync(sd, { recursive: true, force: true });
  fs.mkdirSync(sd, { recursive: true });
  chosen.forEach((p, i) => {
    spawnSync("ffmpeg", ["-v", "error", "-y", "-ss", String(p.t), "-i", path.join(dir, "master.mp4"), "-frames:v", "1", "-vf", "scale=720:-1", path.join(sd, `${String(i + 1).padStart(3, "0")}.jpg`)]);
  });
  fs.writeFileSync(path.join(dir, "verify", "stills.txt"), `${chosen.map((c, i) => `${i + 1}\t${c.t.toFixed(2)}s\t${c.label}`).join("\n")}\n`);
  const sheet = path.join(dir, "verify", "sheet.jpg");
  if (chosen.length) spawnSync("ffmpeg", ["-v", "error", "-y", "-i", path.join(sd, "%03d.jpg"), "-vf", "tile=4x5:padding=4", "-frames:v", "1", sheet]);
  return { sheet: chosen.length ? sheet : null, stills: chosen.map((c, i) => ({ file: `${String(i + 1).padStart(3, "0")}.jpg`, ...c })) };
}

/**
 * Unique frames per second (distinct 1/fps slots that received a frame), per whole second of the
 * keep range, in three groups: agent waits (>= 5 s; loaders and streaming text animate), the 3 s
 * after each such wait (entrance animations), everything else. Needs raw/delivered.json.
 */
export function uniqueFps(dir) {
  const take = readJson(path.join(dir, "take.json"));
  const ev = readJson(path.join(dir, "events.json")).events;
  const dl = readJson(path.join(dir, "raw", "delivered.json"));
  const lat = latencyFn(take);
  const ts = dl.ts.map((w) => w - take.T0 + lat(w));
  const fps = take.fps;
  const keep = take.sync.keep;
  const waits = waitRanges(ev, 5);
  const per = new Map();
  for (const t of ts) {
    const s = Math.floor(t);
    if (!per.has(s)) per.set(s, new Set());
    per.get(s).add(Math.round(t * fps));
  }
  const groups = { agentWait: [], afterReveal: [], other: [] };
  for (let s = Math.ceil(keep.from); s + 1 <= keep.to; s++) {
    const n = per.get(s)?.size ?? 0;
    if (waits.some(([a, b]) => s >= a && s + 1 <= b)) groups.agentWait.push(n);
    else if (waits.some(([, b]) => s >= b && s < b + 3)) groups.afterReveal.push(n);
    else groups.other.push(n);
  }
  const stat = (a) => {
    if (!a.length) return null;
    const b = [...a].sort((x, y) => x - y);
    return { seconds: b.length, median: b[b.length >> 1], p10: b[Math.floor(b.length * 0.1)], min: b[0] };
  };
  return { note: `distinct 1/${fps} s slots with a frame, per whole second of the master clock`, agentWait: stat(groups.agentWait), afterReveal: stat(groups.afterReveal), other: stat(groups.other) };
}
