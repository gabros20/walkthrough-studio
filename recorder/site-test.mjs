// Site-mode check: serves recorder/pages/ on a local port (with a slow /api/search, an /analytics
// endpoint that counts hits and a CSV served as an attachment), records site-test/scenes.json with
// the take runner in --auto mode, then checks the result.
//   take-1-search: banner dismissed, analytics blocked, waitQuiet ended "quiet", marks carry text,
//     a mark and a click (result 8, scrolled out of view first) each get a safe-area scroll, so every
//     click and the result card sit inside the safe band (bottom 120 px kept clear).
//   take-2-ride: a download saved to <take>/downloads/ and logged with its bytes, a confirm dialog
//     answered and logged, and a target=_blank link handled by the popups policy (same-tab: a nav
//     with popup "same-tab"; follow: a nav with newTab; block: a nav with popup "blocked").
//   Both: the master sync passed.
// Usage: node site-test.mjs [--viewport desktop|phone] [--popups same-tab|follow|block]
//        [--dialogs accept|dismiss] [--parallel N]   (takes: $WALKTHROUGH_TAKES or <repo>/takes)
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defaultTakesDir } from "./take.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name, def) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
};
const viewport = arg("viewport", "desktop");
const popups = arg("popups", "same-tab");
const dialogs = arg("dialogs", "accept");
const parallel = arg("parallel", null);
const CSV = "size,rider height,weight\nS,155-168 cm,10.9 kg\nM,167-178 cm,11.2 kg\nL,177-188 cm,11.6 kg\n";

/** The test server: pages/, a slow search API, a counted analytics endpoint, a CSV download. */
export function siteServer() {
  const stats = { analyticsHits: 0 };
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname.startsWith("/analytics/")) {
      stats.analyticsHits++;
      return res.end("ok");
    }
    if (u.pathname === "/files/size-guide.csv") {
      res.setHeader("content-type", "text/csv");
      res.setHeader("content-disposition", 'attachment; filename="size-guide.csv"');
      return res.end(CSV);
    }
    if (u.pathname === "/api/search")
      return setTimeout(() => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(["Ridgeline 7, size S", "Ridgeline 7, size M", "Coastline 3, size S", "Coastline 3, size M", "Ridgeline 7 Cargo, size L", "Coastline 3, size L", "Ridgeline 7, size XS", "Coastline 3, size XL"]));
      }, 1200);
    const f = path.join(here, "pages", u.pathname === "/" ? "site.html" : path.basename(u.pathname));
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return res.writeHead(404).end();
    res.setHeader("content-type", f.endsWith(".html") ? "text/html" : "application/octet-stream");
    fs.createReadStream(f).pipe(res);
  });
  return {
    stats,
    async listen() {
      await new Promise((r) => server.listen(0, "127.0.0.1", r));
      return `http://127.0.0.1:${server.address().port}`;
    },
    close: () => server.close(),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const srv = siteServer();
  const base = await srv.listen();
  const suffix = [viewport, popups !== "same-tab" ? popups : null, dialogs !== "accept" ? dialogs : null, parallel ? `p${parallel}` : null].filter(Boolean).join("-");
  const takes = path.join(defaultTakesDir(), `_site-test-${suffix}`);
  const runArgs = [path.join(here, "takes", "run.mjs"), "--config", path.join(here, "site-test", "walkthrough.config.mjs"), "--auto", "--fresh", "--viewport", viewport, "--base-url", base, "--takes", takes, "--popups", popups, "--dialogs", dialogs];
  if (parallel) runArgs.push("--parallel", parallel);
  // Async spawn: the server above must keep answering while the runner records.
  const t0 = Date.now();
  const child = spawn(process.execPath, runArgs, { stdio: "inherit" });
  const run = { status: await new Promise((r) => child.on("exit", r)) };
  const seconds = Math.round((Date.now() - t0) / 100) / 10;
  srv.close();

  const load = (name) => {
    const dir = path.join(takes, name);
    try {
      return {
        dir,
        ev: JSON.parse(fs.readFileSync(path.join(dir, "events.json"), "utf8")),
        take: JSON.parse(fs.readFileSync(path.join(dir, "take.json"), "utf8")),
      };
    } catch {
      const st = fs.readdirSync(path.join(takes, "_runner")).filter((f) => f.startsWith("status-")).map((f) => JSON.parse(fs.readFileSync(path.join(takes, "_runner", f), "utf8"))).find((x) => x.name === name);
      console.log(`site-test: FAIL (${name} wrote no events.json: ${String(st?.error ?? "no status").split("\n")[0]})`);
      process.exit(1);
    }
  };
  const t1 = load("take-1-search");
  const t2 = load("take-2-ride");
  const finder = (ev) => (type, label) => ev.events.find((e) => e.type === type && e.label === label);
  const find1 = finder(t1.ev);
  const find2 = finder(t2.ev);
  const H = t1.ev.viewport.height;
  const inBand = (b) => b.y >= -1 && b.y + b.height <= H - 120 + 1;
  const card = find1("mark", "result 6 card");
  const download = find2("download", "size guide");
  const savedFile = download ? path.join(t2.dir, "downloads", download.filename) : null;
  const dialog = t2.ev.events.find((e) => e.type === "dialog");
  const popupNav = t2.ev.events.find((e) => e.type === "nav" && (e.popup || e.newTab));
  const headline = find2("mark", "page headline")?.text;
  const wantPopup = { "same-tab": (e) => e?.popup === "same-tab" && e.url.includes("/specs.html"), follow: (e) => e?.newTab === true && e.url.includes("/specs.html"), block: (e) => e?.popup === "blocked" && e.url.includes("/specs.html") }[popups];
  const wantHeadline = popups === "block" ? "Find a bike for this spring" : "Ridgeline 7 spec sheet";
  const wantBooking = dialogs === "accept" ? "Booked for Saturday, 10:00" : "Not booked";
  const checks = {
    runnerExit: run.status === 0,
    seconds,
    parallel: parallel ? Number(parallel) : null,
    viewport: `${t1.ev.viewport.width}x${t1.ev.viewport.height} @${t1.ev.scale} -> ${t1.ev.video.width}x${t1.ev.video.height}`,
    bannerDismissed: t1.take.dismissed.length === 1,
    analyticsBlocked: srv.stats.analyticsHits === 0,
    waitQuiet: find1("waitEnd", "results")?.outcome,
    headlineText: find1("mark", "headline")?.text,
    safeScrolls: t1.ev.events.filter((e) => e.type === "scroll" && e.reason === "safe-area").map((e) => `${e.label} dy ${e.dy}`),
    clicksInsideSafeBand: t1.ev.events.filter((e) => e.type === "down").every((e) => inBand(e.box)),
    cardInsideSafeBand: card ? inBand(card.box) : false,
    cardText: card?.text,
    download: download ? { label: download.label, filename: download.filename, bytes: download.bytes, t: download.t } : null,
    downloadSaved: !!savedFile && fs.existsSync(savedFile) && fs.statSync(savedFile).size === download.bytes && download.bytes === Buffer.byteLength(CSV),
    dialog: dialog ? { label: dialog.label, kind: dialog.kind, action: dialog.action, message: dialog.message, t: dialog.t } : null,
    dialogOk: dialog?.kind === "confirm" && dialog.action === dialogs && dialog.label === "book" && dialog.message.startsWith("Book a test ride"),
    bookingText: find2("mark", "booking note")?.text,
    popup: popups,
    popupNav: popupNav ? { label: popupNav.label, url: popupNav.url, popup: popupNav.popup, via: popupNav.via, newTab: popupNav.newTab, t: popupNav.t } : null,
    pageHeadline: headline,
    pageSwitches: t2.take.capture.pageSwitches ?? 0,
    masterSync: { "take-1-search": t1.take.masterSync.pass, "take-2-ride": t2.take.masterSync.pass },
    syncErrorFrames: Object.fromEntries([t1, t2].map((t) => [t.take.take, [t.take.masterSync.startMedianErrorFrames, t.take.masterSync.endMedianErrorFrames]])),
    gapsOutsideWaitsMs: { "take-1-search": t1.take.gaps.outsideWaits.ms, "take-2-ride": t2.take.gaps.outsideWaits.ms },
    warnings: [...t1.take.warnings, ...t2.take.warnings],
  };
  console.log(JSON.stringify(checks, null, 2));
  const fails = Object.entries({
    runnerExit: checks.runnerExit,
    bannerDismissed: checks.bannerDismissed,
    analyticsBlocked: checks.analyticsBlocked,
    waitQuiet: checks.waitQuiet === "quiet",
    headlineText: !!checks.headlineText,
    safeScroll: checks.safeScrolls.some((l) => l.startsWith("result 8 (safe)")),
    clicksInsideSafeBand: checks.clicksInsideSafeBand,
    cardInsideSafeBand: checks.cardInsideSafeBand,
    downloadSaved: checks.downloadSaved,
    dialogOk: checks.dialogOk,
    bookingText: checks.bookingText === wantBooking,
    popupNav: wantPopup(popupNav),
    pageHeadline: headline === wantHeadline,
    pageSwitches: checks.pageSwitches === (popups === "follow" ? 1 : 0),
    masterSync: t1.take.masterSync.pass && t2.take.masterSync.pass,
  }).filter(([, v]) => !v).map(([k]) => k);
  console.log(fails.length ? `site-test: FAIL (${fails.join(", ")})` : "site-test: pass");
  process.exit(fails.length ? 1 : 0);
}
