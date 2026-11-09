// Site-mode check: serves recorder/pages/ on a local port (with a slow /api/search and an
// /analytics endpoint that counts hits), records site-test/scenes.json with the take runner in
// --auto mode, then checks the result: banner dismissed, analytics blocked, waitQuiet ended
// "quiet", marks carry text, a mark and a click (result 8, scrolled out of view first) each get a safe-area scroll, so every click and the
// result card sit inside the safe band (bottom 120 px kept clear), and the master sync passed.
// Usage: node site-test.mjs [--viewport desktop|phone]   (takes: $WALKTHROUGH_TAKES or <repo>/takes)
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultTakesDir } from "./take.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const vi = process.argv.indexOf("--viewport");
const viewport = vi > 0 ? process.argv[vi + 1] : "desktop";
let analyticsHits = 0;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/analytics/")) {
    analyticsHits++;
    return res.end("ok");
  }
  if (u.pathname === "/api/search")
    return setTimeout(() => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(["Ridgeline 7, size S", "Ridgeline 7, size M", "Coastline 3, size S", "Coastline 3, size M", "Ridgeline 7 Cargo, size L", "Coastline 3, size L", "Ridgeline 7, size XS", "Coastline 3, size XL"]));
    }, 1200);
  const f = path.join(here, "pages", path.basename(u.pathname));
  if (!fs.existsSync(f)) return res.writeHead(404).end();
  res.setHeader("content-type", f.endsWith(".html") ? "text/html" : "application/octet-stream");
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;
const takes = path.join(defaultTakesDir(), `_site-test-${viewport}`);
// Async spawn: the server above must keep answering while the runner records.
const child = spawn(process.execPath, [path.join(here, "takes", "run.mjs"), "--config", path.join(here, "site-test", "walkthrough.config.mjs"), "--auto", "--fresh", "--viewport", viewport, "--base-url", base, "--takes", takes], { stdio: "inherit" });
const run = { status: await new Promise((r) => child.on("exit", r)) };
server.close();

const dir = path.join(takes, "take-1-search");
const ev = JSON.parse(fs.readFileSync(path.join(dir, "events.json"), "utf8"));
const take = JSON.parse(fs.readFileSync(path.join(dir, "take.json"), "utf8"));
const find = (type, label) => ev.events.find((e) => e.type === type && e.label === label);
const H = ev.viewport.height;
const inBand = (b) => b.y >= -1 && b.y + b.height <= H - 120 + 1;
const card = find("mark", "result 6 card");
const checks = {
  runnerExit: run.status === 0,
  viewport: `${ev.viewport.width}x${ev.viewport.height} @${ev.scale} -> ${ev.video.width}x${ev.video.height}`,
  bannerDismissed: take.dismissed.length === 1,
  analyticsBlocked: analyticsHits === 0,
  waitQuiet: find("waitEnd", "results")?.outcome,
  headlineText: find("mark", "headline")?.text,
  safeScrolls: ev.events.filter((e) => e.type === "scroll" && e.reason === "safe-area").map((e) => `${e.label} dy ${e.dy}`),
  clicksInsideSafeBand: ev.events.filter((e) => e.type === "down").every((e) => inBand(e.box)),
  cardInsideSafeBand: card ? inBand(card.box) : false,
  cardText: card?.text,
  masterSync: take.masterSync.pass,
  warnings: take.warnings,
};
console.log(JSON.stringify(checks, null, 2));
const pass = checks.runnerExit && checks.bannerDismissed && checks.analyticsBlocked && checks.waitQuiet === "quiet" && !!checks.headlineText && checks.safeScrolls.some((l) => l.startsWith("result 8 (safe)")) && checks.clicksInsideSafeBand && checks.cardInsideSafeBand && checks.masterSync;
console.log(pass ? "site-test: pass" : "site-test: FAIL");
process.exit(pass ? 0 : 1);
