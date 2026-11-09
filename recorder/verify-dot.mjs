// Pointer-sync check for a take recorded with the calibration dot: at sampled frame times, find the
// magenta dot in the decoded master and compare it with the pointer position computed from
// events.json (the same maths the editor uses). Usage:
//   node recorder/verify-dot.mjs <takeDir> [t1,t2,...]
// Without times it samples: two moves at 50%, one move at 30%, one rest after a click, one rest
// during typing. Writes <takeDir>/verify-dot.json and a PNG crop per sample in <takeDir>/verify/.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { decodeFrames } from "./capture.mjs";
import { pointerAt } from "./motion.mjs";

const dir = process.argv[2];
if (!dir) throw new Error("usage: verify-dot.mjs <takeDir> [times]");
const doc = JSON.parse(fs.readFileSync(path.join(dir, "events.json"), "utf8"));
const { fps, scale, events, pointerStart } = doc;
const master = path.join(dir, "master.mp4");
const moves = events.filter((e) => e.type === "move");

let times;
if (process.argv[3]) times = process.argv[3].split(",").map(Number);
else {
  const at = (m, f) => m.t + (m.tEnd - m.t) * f;
  const down = events.find((e) => e.type === "down" && e.label === moves[1]?.label);
  const type = events.find((e) => e.type === "type");
  times = [
    at(moves[0], 0.5),
    at(moves[1], 0.5),
    at(moves[Math.min(3, moves.length - 1)], 0.3),
    down ? down.t + 0.05 : at(moves[1], 1) + 0.1,
    type ? (type.t + type.tEnd) / 2 : at(moves[2], 1) + 0.1,
  ];
}
// Snap to frame start times.
times = times.map((t) => Math.round(t * fps) / fps);

const R = 150; // search radius, CSS px
const results = [];
fs.mkdirSync(path.join(dir, "verify"), { recursive: true });
for (const t of times) {
  const expected = pointerAt(events, t, pointerStart);
  const cx = Math.max(0, Math.min(doc.viewport.width - 2 * R, expected.x - R));
  const cy = Math.max(0, Math.min(doc.viewport.height - 2 * R, expected.y - R));
  const size = Math.round(2 * R * scale);
  const crop = `crop=${size}:${size}:${Math.round(cx * scale)}:${Math.round(cy * scale)}`;
  let found = null;
  await decodeFrames(master, { width: size, height: size, pix: "rgb24", vf: crop, ss: t, frames: 1 }, (buf) => {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 3;
        if (buf[i] > 200 && buf[i + 1] < 90 && buf[i + 2] > 200) {
          sx += x;
          sy += y;
          n++;
        }
      }
    if (n > 20) found = { x: cx + sx / n / scale, y: cy + sy / n / scale, pixels: n };
  });
  const r = {
    t,
    frame: Math.round(t * fps),
    expected: { x: +expected.x.toFixed(2), y: +expected.y.toFixed(2) },
    dot: found && { x: +found.x.toFixed(2), y: +found.y.toFixed(2) },
    errorPx: found ? +Math.hypot(found.x - expected.x, found.y - expected.y).toFixed(2) : null,
  };
  // Best time shift: which logged time does the dot match? (only meaningful while moving)
  if (found) {
    let best = { d: Infinity, s: 0 };
    for (let s = -0.1; s <= 0.1001; s += 0.001) {
      const p = pointerAt(events, t - s, pointerStart);
      const d = Math.hypot(p.x - found.x, p.y - found.y);
      if (d < best.d) best = { d, s };
    }
    const moving = moves.some((m) => t > m.t && t < m.tEnd);
    r.moving = moving;
    if (moving) r.bestShiftMs = Math.round(best.s * 1000);
  }
  // Crop for a visual check (expected point marked with a cyan crosshair).
  const png = path.join(dir, "verify", `dot-${r.frame}.png`);
  const ex = Math.round((expected.x - cx) * scale);
  const ey = Math.round((expected.y - cy) * scale);
  spawnSync("ffmpeg", [
    "-v", "error", "-y", "-ss", String(t), "-i", master, "-frames:v", "1",
    "-vf", `${crop},drawbox=x=${ex - 30}:y=${ey - 1}:w=60:h=2:color=cyan:t=fill,drawbox=x=${ex - 1}:y=${ey - 30}:w=2:h=60:color=cyan:t=fill`,
    png,
  ]);
  r.png = png;
  results.push(r);
}
const frameMs = 1000 / fps;
const pass = results.every((r) => r.errorPx !== null && (r.moving ? Math.abs(r.bestShiftMs) <= frameMs : r.errorPx <= 1.5));
const out = { take: doc.take, fps, pass, rule: "at rest: dot within 1.5 CSS px of the logged point; moving: the dot matches the logged curve at a time within one frame of t (bestShiftMs; errorPx is shown for scale, peak pointer speed is up to about 80 CSS px per frame)", samples: results };
fs.writeFileSync(path.join(dir, "verify-dot.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
