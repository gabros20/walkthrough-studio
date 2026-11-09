// Prints the per-take part of takes/INDEX.md from each take's events.json, take.json and truth.json
// (format: docs/CONTRACT.md, "takes/INDEX.md"). Needs raw/delivered.json in each take.
// Usage: node recorder/takes/index-data.mjs [--takes DIR] [takeName] > section.md
//   DIR defaults to $WALKTHROUGH_TAKES, else <repo>/takes. Only folders named take-<n>... are listed.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "../config.mjs";
import { defaultTakesDir } from "../take.mjs";

const { flags, rest } = parseArgs(process.argv.slice(2));
const TAKES_DIR = path.resolve(flags.takes ?? defaultTakesDir());

const f2 = (v) => (v === undefined || v === null ? "" : Number(v).toFixed(2));
const only = rest[0];
const dirs = fs
  .readdirSync(TAKES_DIR)
  .filter((d) => /^take-\d/.test(d) && (!only || d === only))
  .sort((a, b) => Number.parseInt(a.split("-")[1], 10) - Number.parseInt(b.split("-")[1], 10) || a.localeCompare(b));
for (const d of dirs) {
  const dir = path.join(TAKES_DIR, d);
  const doc = JSON.parse(fs.readFileSync(path.join(dir, "events.json"), "utf8"));
  const take = JSON.parse(fs.readFileSync(path.join(dir, "take.json"), "utf8"));
  const ev = doc.events;
  const dl = JSON.parse(fs.readFileSync(path.join(dir, "raw", "delivered.json"), "utf8"));
  const keep = take.sync.keep;
  console.log(`\n## ${d}\n`);
  console.log(`- master.mp4: ${take.master.width}x${take.master.height}, ${take.fps} fps, ${f2(take.master.duration)} s. Keep ${f2(keep.from)}-${f2(keep.to)} s (sync flashes outside).`);
  console.log(`- Sync: flash-group median error start ${take.masterSync.startMedianErrorFrames} / end ${take.masterSync.endMedianErrorFrames} frames (pass: ${take.masterSync.pass}); latency ${take.sync.startLatencyMs} -> ${take.sync.endLatencyMs} ms (${take.sync.latencyModel}).`);
  // waits
  const waits = [];
  for (const e of ev) if (e.type === "waitStart") {
    const end = ev.find((x) => x.type === "waitEnd" && x.label === e.label);
    waits.push({ label: e.label, t: e.t, tEnd: end?.t, outcome: end?.outcome, seconds: end?.seconds, end });
  }
  const worked = ev.filter((e) => e.type === "mark" && / worked for$|^worked for$/.test(e.label)).map((e) => `"${(e.text ?? "").replace(/\s*›\s*/g, "").trim()}" (mark "${e.label}" at ${f2(e.t)} s)`);
  console.log(`- Waits (label: range, outcome):`);
  for (const w of waits) console.log(`  - "${w.label}": ${f2(w.t)}-${f2(w.tEnd)} s (${f2(w.tEnd - w.t)} s), ${w.outcome}${w.seconds ? `, chat request ${w.seconds} s` : ""}`);
  if (worked.length) console.log(`- App's own duration line: ${worked.join("; ")}`);
  // capture gaps (with the take's own latency model)
  const { Ls, Le, wA, wB } = take.latency;
  const lat = (w) => (w <= wA ? Ls : w >= wB ? Le : Ls + ((Le - Ls) * (w - wA)) / (wB - wA));
  const ts = dl.ts.map((w) => w - take.T0 + lat(w));
  const flashes = ev.filter((e) => e.type === "sync").map((e) => e.t);
  const moves = ev.filter((e) => e.type === "move");
  const typing = ev.filter((e) => e.type === "type");
  const stalls = [];
  const inside = [];
  for (let i = 1; i < ts.length; i++) {
    const g = (ts[i] - ts[i - 1]) * 1000;
    if (g <= 100) continue;
    const a = ts[i - 1];
    const b = ts[i];
    if (flashes.some((f) => a >= f - 0.05 && a <= f + 0.3)) continue;
    const inWait = waits.find((w) => a >= w.t && b <= (w.tEnd ?? 1e9) + 0.5 && (w.tEnd ?? 1e9) - w.t >= 5);
    if (inWait) {
      inside.push(g);
      continue;
    }
    const moving = moves.find((m) => m.t < b && m.tEnd > a);
    const typingRun = typing.find((ty) => ty.t <= b && ty.tEnd >= a);
    const prev = ev.filter((e) => !["cursor", "mark", "sync"].includes(e.type) && e.t <= b).at(-1);
    const what = typingRun ? `typing "${typingRun.label}"${typingRun.boxEnd && typingRun.box && typingRun.boxEnd.height > typingRun.box.height ? " (field grows a line)" : ""}` : prev ? `after ${prev.type} "${prev.label}"` : "";
    stalls.push(`${f2(a)}-${f2(b)} s (${g.toFixed(0)} ms): ${what}; pointer ${moving ? `MOVING (move "${moving.label}")` : "at rest"}`);
  }
  console.log(`- Frozen stretches over 100 ms outside agent waits (start-end on the master clock): ${stalls.length ? "" : "none"}`);
  for (const s of stalls) console.log(`  - ${s}`);
  if (inside.length) console.log(`- Inside agent waits: ${inside.length} gaps over 100 ms (max ${Math.max(...inside).toFixed(0)} ms), time-lapse these ranges.`);
  if (take.uniqueFps) {
    const u = take.uniqueFps;
    const fmt = (x) => (x ? `median ${x.median}, p10 ${x.p10}, min ${x.min} (${x.seconds} s)` : "n/a");
    console.log(`- Unique frames per second: agent waits (loaders, streaming) ${fmt(u.agentWait)}; 3 s after each reveal ${fmt(u.afterReveal)}; rest ${fmt(u.other)}.`);
  }
  // timeline
  console.log(`- Timeline (type "label" t[-tEnd]; marks give boxes in events.json):`);
  const skip = new Set(["cursor", "sync"]);
  const rows = [];
  for (const e of ev) {
    if (skip.has(e.type) || e.type === "up") continue;
    if (e.type === "move" && e.role === "approach") continue; // shown by its down
    let extra = "";
    if (e.type === "type") extra = ` text: "${e.text}"`;
    if (e.type === "waitEnd") extra = ` -> ${e.outcome}`;
    if (e.type === "mark" && e.text) extra = ` "${String(e.text).replace(/\s*›\s*/g, "").trim().slice(0, 50)}"`;
    if (e.type === "scroll") extra = ` dy ${e.dy}${e.dx ? ` dx ${e.dx}` : ""}`;
    rows.push(`  - ${f2(e.t)}${e.tEnd !== undefined ? `-${f2(e.tEnd)}` : ""} ${e.type} "${e.label}"${extra}`);
  }
  console.log(rows.join("\n"));
  const truthFile = path.join(dir, "truth.json");
  const truth = fs.existsSync(truthFile) ? JSON.parse(fs.readFileSync(truthFile, "utf8")) : null;
  const short = JSON.stringify(truth, (k, v) => (k === "copy" || k === "clipboard" || k === "primaryText" ? undefined : v));
  console.log(`- Truth data (truth.json, copy text omitted here): \`${short.slice(0, 900)}${short.length > 900 ? "…" : ""}\``);
}
