// Verifies the drawn pointer follows the recorder's curve exactly: emits pointer moves with the
// real components, runs them in Chrome with GSAP, seeks the timeline, and compares the drawn
// hotspot (chord + bulge) with recorder/motion.mjs positionOnMove at many instants.
// Usage: node scripts/verify-pointer.mjs   (exit 1 on any error over 0.05 capture px)
// Needs playwright-core (the recorder's: npm --prefix recorder install; or in film/ or the repo root) and a Chrome:
// the HyperFrames headless shell (~/.cache/hyperframes/chrome, any platform), else CHROME_PATH.
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Timeline, prelude } from "../lib/emit.mjs";
import { pointerMove } from "../lib/pointer.mjs";
import { K } from "../lib/config.mjs";
import { controlPoint, moveDuration, positionOnMove } from "../../recorder/motion.mjs";

// playwright-core from the recorder (its dependency), film/ or the repo root, whichever has it
let chromium;
for (const base of ["../../recorder/package.json", "../package.json", "../../package.json"]) {
  try { ({ chromium } = createRequire(new URL(base, import.meta.url))("playwright-core")); break; } catch {}
}
if (!chromium) { console.error("playwright-core not found: npm --prefix recorder install (or npm install playwright-core in film/)"); process.exit(1); }

function findShell() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = join(homedir(), ".cache/hyperframes/chrome/chrome-headless-shell");
  for (const v of existsSync(base) ? readdirSync(base) : [])
    for (const plat of existsSync(join(base, v)) ? readdirSync(join(base, v)) : []) {
      for (const exe of ["chrome-headless-shell", "chrome-headless-shell.exe"]) {
        const p = join(base, v, plat, exe);
        if (existsSync(p)) return p;
      }
    }
  return undefined;
}

// Consecutive moves chain (each starts where the last ended), as the Pointer helper emits them.
const cases = [
  { from: { x: 1700, y: 980 }, to: { x: 405, y: 724 } },
  { from: { x: 405, y: 724 }, to: { x: 620, y: 630 } },
  { from: { x: 620, y: 630 }, to: { x: 620, y: 100 } }, // vertical
  { from: { x: 620, y: 100 }, to: { x: 1300, y: 100 } }, // horizontal
  { from: { x: 1300, y: 100 }, to: { x: 200, y: 700 }, control: { x: 400, y: 300 } }, // logged control
];
const tl = new Timeline();
const moves = [];
let t = 0;
for (const c of cases) {
  const dur = moveDuration(c.from, c.to);
  const m = { from: c.from, to: c.to, control: c.control ?? controlPoint(c.from, c.to), t, tEnd: t + dur };
  moves.push(m);
  tl.add(pointerMove({ id: "p", from: c.from, to: c.to, start: t, end: t + dur, control: c.control }));
  t += dur + 0.2;
}
const html = `<!doctype html><html><body>
<div id="p"><div id="p-arc"></div></div>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
<script>${prelude()}
const tl = gsap.timeline({ paused: true });
${tl.toString()}
window.sample = (time) => { tl.seek(time, false); const g = gsap.getProperty;
  return { x: g("#p","x") + g("#p-arc","x"), y: g("#p","y") + g("#p-arc","y") }; };
</script></body></html>`;

const browser = await chromium.launch({ headless: true, executablePath: findShell() });
const page = await browser.newPage();
await page.setContent(html, { waitUntil: "networkidle" });
let worst = 0;
let count = 0;
// Seek forwards, then backwards (the render seeks in any order).
const times = [];
for (const m of moves) for (let i = 0; i <= 20; i++) times.push(m.t + ((m.tEnd - m.t) * i) / 20);
for (const time of [...times, ...times.slice().reverse()]) {
  const m = moves.find((mm) => time >= mm.t - 1e-9 && time <= mm.tEnd + 1e-9);
  const want = positionOnMove(m, time);
  const got = await page.evaluate((tt) => window.sample(tt), time);
  const err = Math.hypot(got.x / K - want.x, got.y / K - want.y);
  worst = Math.max(worst, err);
  count++;
}
await browser.close();
console.log(`pointer path: ${count} samples over ${moves.length} moves, worst error ${worst.toFixed(4)} capture px`);
process.exit(worst > 0.05 ? 1 : 0);
