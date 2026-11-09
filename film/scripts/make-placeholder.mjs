// Stand-ins for the component demo (build-demo.mjs), so it runs without any recording or client file:
//
// 1. assets/footage/placeholder.mp4: a flat take master at 2x the capture size (2880x1620 for
//    1440x810 CSS px), paper ground, a 90 px capture grid, the demo target boxes outlined, and a bar
//    that moves with time (so playback and seeking are visible).
// 2. assets/creatives/placeholder-*.png + assets/creatives/manifest.json: eight flat "creatives"
//    (square, 4:5 and 9:16) for the title wall and the end cascade. Written only when there is no
//    manifest yet, or with --creatives (which replaces it).
//
// Usage: node scripts/make-placeholder.mjs [seconds=30] [--creatives]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CAPTURE, COLOR, FILM_DIR } from "../lib/config.mjs";
import { TARGETS } from "../demo/targets.mjs";

const film = FILM_DIR;
const secs = Number(process.argv.slice(2).find((a) => /^\d+(\.\d+)?$/.test(a)) ?? 30);
const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? "0x" + c.slice(1) : "0xF4F2EE");
const W = CAPTURE.width * 2, H = CAPTURE.height * 2;

// ---------- footage ----------
mkdirSync(join(film, "assets/footage"), { recursive: true });
const f = [];
for (let x = 90; x < CAPTURE.width; x += 90) f.push(`drawbox=x=${x * 2}:y=0:w=2:h=${H}:color=0xE2DED6:t=fill`);
for (let y = 90; y < CAPTURE.height; y += 90) f.push(`drawbox=x=0:y=${y * 2}:w=${W}:h=2:color=0xE2DED6:t=fill`);
f.push(`drawbox=x=0:y=0:w=${W}:h=128:color=0xFFFFFF:t=fill`); // header strip
for (const b of Object.values(TARGETS))
  f.push(`drawbox=x=${b.x * 2}:y=${b.y * 2}:w=${b.w * 2}:h=${b.h * 2}:color=0x9A968E:t=4`);
f.push(`drawbox=x='mod(t*400,${W})':y=${H - 20}:w=120:h=20:color=0x141414:t=fill`);
execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${hex(COLOR.paper)}:s=${W}x${H}:r=30:d=${secs}`, "-vf", f.join(","), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-g", "30", join(film, "assets/footage/placeholder.mp4")], { stdio: "inherit" });
console.log("wrote assets/footage/placeholder.mp4");

// ---------- creatives ----------
const manifest = join(film, "assets/creatives/manifest.json");
if (existsSync(manifest) && !process.argv.includes("--creatives")) {
  console.log("assets/creatives/manifest.json exists: creatives left alone (--creatives replaces them)");
} else {
  mkdirSync(join(film, "assets/creatives"), { recursive: true });
  const sizes = [[1080, 1080], [1080, 1350], [1080, 1920], [1080, 1350], [1080, 1080], [1080, 1350], [1080, 1080], [1080, 1920]];
  const tones = ["0x2B3A55", "0x5B6B4E", "0x8A5A44", "0x3F5E68", "0x6E4F6B", "0x4C5A3A", "0x7A6A4F", "0x34495E"];
  const out = sizes.map(([w, h], i) => {
    const id = `placeholder-${i + 1}`;
    const src = `assets/creatives/${id}.png`;
    // a photo band, a headline bar and a button block, so crops and cascades read as "a creative"
    const vf = [
      `drawbox=x=0:y=0:w=${w}:h=${Math.round(h * 0.62)}:color=${tones[(i + 3) % tones.length]}:t=fill`,
      `drawbox=x=72:y=${Math.round(h * 0.68)}:w=${Math.round(w * 0.7)}:h=56:color=0xF4F2EE:t=fill`,
      `drawbox=x=72:y=${Math.round(h * 0.68) + 80}:w=${Math.round(w * 0.45)}:h=40:color=0xD9D4CA:t=fill`,
      `drawbox=x=72:y=${h - 150}:w=260:h=72:color=${hex(COLOR.accent)}:t=fill`,
    ].join(",");
    execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `color=c=${tones[i]}:s=${w}x${h}`, "-vf", vf, "-frames:v", "1", join(film, src)]);
    return { id, src, w, h };
  });
  writeFileSync(manifest, JSON.stringify(out, null, 2) + "\n");
  console.log(`wrote ${out.length} placeholder creatives and assets/creatives/manifest.json`);
}
