// Rebuild a take's constant-frame-rate master from its raw screencast frames, e.g. at 30 fps.
// Times in events.json are seconds and stay valid at any frame rate.
// Usage: node recorder/remux.mjs <takeDir> [--fps 30] [--crf 12] [--preset medium] [--out file]
import fs from "node:fs";
import path from "node:path";
import { encodeMaster, probe } from "./capture.mjs";

const args = process.argv.slice(2);
const dir = args[0];
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i > 0 ? args[i + 1] : d;
};
if (!dir) throw new Error("usage: remux.mjs <takeDir> [--fps 30] [--crf 12] [--preset medium] [--out file]");
const take = JSON.parse(fs.readFileSync(path.join(dir, "take.json"), "utf8"));
if (!fs.existsSync(path.join(dir, "raw", "frames.bin"))) throw new Error("raw frames were deleted for this take");
const fps = Number(opt("fps", take.fps));
const out = opt("out", path.join(dir, fps === take.fps ? "master.mp4" : `master-${fps}.mp4`));
// Same end point as the original master, on the same seconds clock.
const duration = take.encode.frames / take.fps;
const lastSlot = Math.round(duration * fps) - 1;
const r = await encodeMaster({ dir, out, fps, T0: take.T0, lastSlot, crf: Number(opt("crf", 12)), preset: opt("preset", "medium") });
const info = await probe(out);
console.log(JSON.stringify({ ...r, width: info.width, height: info.height, duration: info.duration }, null, 2));
