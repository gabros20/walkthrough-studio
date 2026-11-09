// Recording session and takes: drives an invisible mouse along the same arcs the editor will draw,
// captures the page with the DevTools screencast, and logs every action on the master.mp4 clock.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  contextOptions,
  decodeFrames,
  decodeJpegs,
  encodeMaster,
  isFlash,
  launchBrowser,
  nowWall,
  probe,
  readIndex,
  Screencast,
  sleep,
} from "./capture.mjs";
import { installRecorderPage } from "./inpage.mjs";
import { bezier, controlPoint, MOTION, moveDuration, power3InOut } from "./motion.mjs";
import { typingDelays } from "./rng.mjs";

/**
 * Schema id written to events.json. Same structure as the earlier "kleber-take/1"; readers accept
 * both ids (docs/CONTRACT.md).
 */
export const SCHEMA = "walkthrough-take/1";

/**
 * Where takes go when neither the caller nor a config names a folder: $WALKTHROUGH_TAKES, else
 * takes/ at the repo root (next to recorder/, ignored by git). Never inside recorder/takes/, which
 * holds code.
 */
export function defaultTakesDir() {
  return path.resolve(process.env.WALKTHROUGH_TAKES || fileURLToPath(new URL("../takes", import.meta.url)));
}
const FLASH_COLOR = "#00ff00";
const FLASH_RGB = [0, 255, 0];
const FLASH_MS = 100;
const FLASHES = 3;
const FLASH_GAP_MS = 350;
const median = (a) => {
  const b = [...a].sort((x, y) => x - y);
  return b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2;
};

const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;
const pt = (p) => ({ x: r2(p.x), y: r2(p.y) });
const boxOf = (b) => b && { x: r2(b.x), y: r2(b.y), width: r2(b.width), height: r2(b.height) };

/**
 * Turn a target spec into a Playwright Locator (first match unless `nth` is given):
 *   "css selector"                          page.locator(sel)
 *   { role: "button", name: "Continue" }    page.getByRole(role, { name, exact })
 *   { text: "Sign in" }                     page.getByText(text, { exact })
 *   { label: "Email" }                      page.getByLabel(label, { exact })
 *   { placeholder: "Search" }               page.getByPlaceholder(...)
 *   { testId: "save" }                      page.getByTestId(...)
 *   { selector: "css", has?: "css" }        page.locator(selector, { has })
 * A Locator is returned as is. `name` / `text` may be a RegExp. Add `nth: i` for another match.
 */
export function locate(page, spec) {
  if (spec && typeof spec === "object" && typeof spec.boundingBox === "function") return spec;
  if (typeof spec === "string") return page.locator(spec).first();
  if (!spec || typeof spec !== "object") throw new Error(`bad target ${JSON.stringify(spec)}`);
  const exact = spec.exact;
  let loc;
  if (spec.role) loc = page.getByRole(spec.role, spec.name !== undefined ? { name: spec.name, exact } : {});
  else if (spec.text !== undefined) loc = page.getByText(spec.text, { exact });
  else if (spec.label !== undefined) loc = page.getByLabel(spec.label, { exact });
  else if (spec.placeholder !== undefined) loc = page.getByPlaceholder(spec.placeholder, { exact });
  else if (spec.testId !== undefined) loc = page.getByTestId(spec.testId);
  else if (spec.selector) loc = page.locator(spec.selector, spec.has ? { has: page.locator(spec.has) } : {});
  else throw new Error(`target needs role, text, label, placeholder, testId or selector: ${JSON.stringify(spec)}`);
  if (spec.visible !== false) loc = loc.filter({ visible: true });
  return spec.nth !== undefined ? loc.nth(spec.nth) : loc.first();
}

const isPoint = (t) => t && typeof t.x === "number" && t.width === undefined && typeof t.boundingBox !== "function";
const isBox = (t) => t && typeof t.width === "number" && typeof t.boundingBox !== "function";

/**
 * Open a browser session. One session can record several takes in a row (a walkthrough is usually
 * recorded as one continuous browser session, so cookies and app state carry over).
 *
 * mode: "new" (full Chromium, new headless, GPU; the default and the proven method on real apps),
 * "shell" (headless shell, software GPU) or "headed". See docs/CAPTURE_TEST.md.
 * restGuard: { selector, zone, margin } for horizontally scrolling rows that scroll when the mouse
 * rests near a faded edge (hover-to-scroll). Off (null) by default; set it per app.
 * device: extra context options for emulation (phone preset: isMobile, hasTouch, userAgent).
 * blockUrls: glob strings or RegExps; matching requests are aborted (analytics, chat widgets).
 * dismiss: targets (see locate) clicked off camera, if visible, before each take's start flashes.
 * safeArea: { top, bottom, on: ["click", "mark"] } safe band in CSS px (see scrollIntoViewSafe).
 */
export async function openSession({
  mode = "new",
  scale = 2,
  width = 1440,
  height = 810,
  calibrationDot = false,
  heartbeat = false,
  everyNthFrame = 1,
  pointerStart = { x: 1080, y: height + 40 },
  storageState,
  restGuard = null,
  context: extraContext = {},
  launchArgs = [],
  takesDir = defaultTakesDir(),
  device = null,
  blockUrls = [],
  dismiss = [],
  safeArea = null,
} = {}) {
  const browser = await launchBrowser({ mode, scale, args: launchArgs });
  const context = await browser.newContext(
    contextOptions({ width, height, scale, storageState, ...(device ?? {}), ...extraContext }),
  );
  for (const pattern of blockUrls ?? []) await context.route(pattern, (route) => route.abort("blockedbyclient"));
  const session = new Session({ browser, context, mode, scale, width, height, restGuard, calibrationDot, heartbeat, everyNthFrame, takesDir, device, dismiss: dismiss ?? [], safeArea });
  await context.exposeBinding("__recCursor", (_src, c) => session.onCursorChange(c));
  await context.addInitScript(installRecorderPage, { dot: calibrationDot, heartbeat });
  session.page = await context.newPage();
  session.cdp = await context.newCDPSession(session.page);
  session.page.on("domcontentloaded", () => {
    const p = session.pointer;
    session.page.evaluate(([x, y]) => window.__rec?.knowMouse(x, y), [p.x, p.y]).catch(() => {});
  });
  session.page.on("framenavigated", (frame) => {
    if (frame === session.page.mainFrame()) session.take?.onFrameNavigated(frame.url());
  });
  // Requests in flight, page-wide, for waitQuiet. Long-lived streams (EventSource, media) and
  // websockets never finish, so they do not count.
  const tracked = (req) => !["eventsource", "media", "websocket"].includes(req.resourceType());
  session.page.on("request", (req) => {
    if (tracked(req)) session.inflight.set(req, nowWall());
  });
  session.page.on("requestfinished", (req) => session.inflight.delete(req));
  session.page.on("requestfailed", (req) => session.inflight.delete(req));
  await session.page.mouse.move(pointerStart.x, pointerStart.y);
  session.pointer = { ...pointerStart };
  return session;
}

class Session {
  constructor(o) {
    Object.assign(this, o);
    this.take = null;
    this.pointer = { x: 0, y: 0 };
    this.inflight = new Map();
    this.version = o.browser.version();
  }

  /**
   * Click every visible `dismiss` target (cookie and consent banners), off camera. Runs before each
   * take's start flashes; returns the targets it clicked.
   */
  async dismissBanners(targets = this.dismiss) {
    const clicked = [];
    if (!targets?.length) return clicked;
    await this.offCamera(async (page) => {
      for (const t of targets) {
        const loc = locate(page, t);
        if (!(await loc.isVisible().catch(() => false))) continue;
        await loc.click({ timeout: 3000 }).then(() => clicked.push(t)).catch(() => {});
        await page.waitForTimeout(300);
      }
    });
    return clicked;
  }

  onCursorChange(c) {
    this.take?.cursorChanged(c, nowWall());
  }

  /** Start a take: screencast on, start flashes. Output goes to `dir` (default: <takesDir>/<name>). */
  async startTake(name, { dir = path.join(this.takesDir, name), fps = 60, quality = 90, overwrite = false } = {}) {
    if (this.take) throw new Error(`take ${this.take.name} is still running`);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
      if (!overwrite) throw new Error(`take folder ${dir} exists; pass { overwrite: true } to replace it`);
      fs.rmSync(dir, { recursive: true, force: true });
    }
    fs.mkdirSync(dir, { recursive: true });
    // Raw frames need up to ~25 MB/s under heavy animation (about 9 GB for 6 minutes); a static UI
    // needs far less. Refuse to start below 4 GB free, warn below 12 GB.
    const st = fs.statfsSync(dir);
    const freeGB = (st.bavail * st.bsize) / 1e9;
    if (freeGB < 4) throw new Error(`only ${freeGB.toFixed(1)} GB free at ${dir}; free space or move takes first`);
    if (freeGB < 12) console.warn(`[take ${name}] low disk: ${freeGB.toFixed(1)} GB free at ${dir}`);
    const dismissed = await this.dismissBanners();
    const take = new Take(this, name, dir, fps, quality);
    take.dismissed = dismissed;
    this.take = take;
    await take.begin();
    return take;
  }

  /**
   * Run fn between takes (nothing is recorded); the mouse is put back where the pointer is, so the
   * next take's pointerStart stays true.
   */
  async offCamera(fn) {
    if (this.take) throw new Error("offCamera() while a take is running");
    try {
      return await fn(this.page);
    } finally {
      await this.page.mouse.move(this.pointer.x, this.pointer.y).catch(() => {});
    }
  }

  async close() {
    await this.browser.close();
  }
}

export class Take {
  constructor(session, name, dir, fps, quality) {
    this.session = session;
    this.page = session.page;
    this.name = name;
    this.dir = dir;
    this.fps = fps;
    this.quality = quality;
    this.raw = []; // events with wall-clock times (seconds), converted at finish
    this.keys = new Set();
    this.autoCount = new Map();
    this.moving = false;
    this.inNav = false;
    this.lastCursor = null;
    this.warnings = [];
  }

  // ------------------------------------------------------------------ logging

  label(type, label, auto = false) {
    if (!label) throw new Error(`${type}: a label is required`);
    const key = `${type}:${label}`;
    if (this.keys.has(key)) {
      if (!auto) throw new Error(`duplicate label "${label}" for ${type} events in take ${this.name}`);
      const n = (this.autoCount.get(key) ?? 1) + 1;
      this.autoCount.set(key, n);
      return this.label(type, `${label} #${n}`, true);
    }
    this.keys.add(key);
    return label;
  }

  log(e) {
    this.raw.push(e);
    return e;
  }

  warn(msg) {
    this.warnings.push(msg);
    console.warn(`[take ${this.name}] ${msg}`);
  }

  cursorChanged(c, w) {
    if (this.lastCursor && this.lastCursor.kind === c.kind && this.lastCursor.raw === c.raw) return;
    this.lastCursor = { kind: c.kind, raw: c.raw };
    this.log({ type: "cursor", w, cursor: c.kind, raw: c.raw, at: pt(c) });
  }

  async readCursor(p = this.session.pointer) {
    try {
      return await this.page.evaluate(([x, y]) => window.__rec?.cursorAt(x, y) ?? null, [p.x, p.y]);
    } catch {
      return null;
    }
  }

  onFrameNavigated(url) {
    if (this.inNav || this.finished) return;
    let p = url;
    try {
      p = new URL(url).pathname;
    } catch {}
    this.log({ type: "nav", w: nowWall(), wEnd: nowWall(), label: this.label("nav", `url ${p}`, true), url, auto: true });
  }

  // ------------------------------------------------------------------ lifecycle

  async begin() {
    const s = this.session;
    this.cast = new Screencast(s.cdp, this.dir, {
      fps: this.fps,
      width: s.width * s.scale,
      height: s.height * s.scale,
      quality: this.quality,
      everyNthFrame: this.session.everyNthFrame ?? 1,
    });
    this.pointerStart = { ...s.pointer };
    await this.cast.start();
    const first = await Promise.race([this.cast.firstFrame, sleep(3000).then(() => null)]);
    if (!first) {
      // Static page: nudge a repaint so the screencast delivers its first frame.
      await this.page.evaluate(() => window.__rec?.flash("transparent", 50)).catch(() => {});
      await this.cast.firstFrame;
    }
    await sleep(250);
    // Three flashes at each end: one flash's latency jitters by up to a frame and a half (capture
    // cadence), the median of three is stable.
    this.flashStarts = [];
    for (let k = 0; k < FLASHES; k++) {
      this.flashStarts.push(await this.flash());
      await sleep(FLASH_GAP_MS);
    }
    this.cursorPoll = setInterval(() => this.pollCursor(), 200);
    const c = await this.readCursor();
    if (c) this.cursorChanged({ ...c, ...s.pointer }, nowWall());
  }

  async pollCursor() {
    if (this.moving || this.polling || this.finished) return;
    this.polling = true;
    const c = await this.readCursor();
    this.polling = false;
    if (c && !this.moving) this.cursorChanged({ ...c, ...this.session.pointer }, nowWall());
  }

  /**
   * Sync flash. Returns the in-page wall time (seconds) at which the flash element was inserted,
   * taken at an idle moment of the main thread, so the measured flash latency is the render path
   * only (next frame + raster + capture) and is the same at the start and the end of a take.
   */
  async flash() {
    const send = nowWall();
    const exec = await this.page.evaluate(([c, ms]) => window.__rec.flashWhenIdle(c, ms), [FLASH_COLOR, FLASH_MS]);
    (this.flashSends ??= []).push(send);
    return exec / 1000;
  }

  /**
   * End flash, stop capture, encode master.mp4, verify sync and write events.json + take.json.
   * Returns the take summary (also in take.json).
   */
  async finish({ encode = true, preset = "medium", crf = 12, tail = 0.5, keepRaw = true } = {}) {
    clearInterval(this.cursorPoll);
    await sleep(300);
    this.flashEnds = [];
    for (let k = 0; k < FLASHES; k++) {
      this.flashEnds.push(await this.flash());
      if (k < FLASHES - 1) await sleep(FLASH_GAP_MS);
    }
    await sleep(tail * 1000 + FLASH_MS);
    const wStop = nowWall();
    this.finished = true;
    const cast = await this.cast.stop();
    this.session.take = null;

    const fps = this.fps;
    const found = [];
    for (const [group, list] of [["start", this.flashStarts], ["end", this.flashEnds]])
      for (const [k, w] of list.entries()) {
        const f = await this.findFlashInRaw(w, FLASH_GAP_MS / 1000);
        if (!f) throw new Error(`sync flash ${group} ${k + 1} not found in raw frames`);
        found.push({ group, k, w, ts: f.ts, slot: f.slot, latency: f.ts - w });
      }
    // Frame timestamps and action times are both system-clock seconds, so an action at wall time w
    // is on the master clock at (w - T0). Add the median render latency L of the six flashes, so a
    // logged time is when the action's effect is visible in the master.
    // The render-and-capture latency grows with the page's content (a photo-heavy 2880x1620 frame
    // takes longer to capture than a near-white one), so it is measured at each end: Ls from the
    // start flashes, Le from the end flashes. If the take has a long wait (an agent turn, where the
    // page changes from light to heavy), Ls applies before it, Le after it, and the latency moves
    // linearly across the wait; otherwise it moves linearly across the take.
    const T0 = cast.T0;
    const L = median(found.map((f) => f.latency));
    const Ls = median(found.filter((f) => f.group === "start").map((f) => f.latency));
    const Le = median(found.filter((f) => f.group === "end").map((f) => f.latency));
    let wA = median(this.flashStarts);
    let wB = median(this.flashEnds);
    const waitsRaw = [];
    for (const e of this.raw) if (e.type === "waitStart") {
      const end = this.raw.find((x) => x.type === "waitEnd" && x.label === e.label);
      if (end && end.w - e.w >= 5) waitsRaw.push([e.w, end.w]);
    }
    if (waitsRaw.length) {
      const longest = waitsRaw.sort((a, b) => b[1] - b[0] - (a[1] - a[0]))[0];
      [wA, wB] = longest;
    }
    const latencyAt = (w) => (w <= wA ? Ls : w >= wB ? Le : Ls + ((Le - Ls) * (w - wA)) / (wB - wA));
    const toT = (w) => r4(w - T0 + latencyAt(w));
    for (const f of found) {
      f.m = f.slot / fps; // where the flash really is in the master
      f.errorFrames = r2((f.m - toT(f.w)) * fps);
    }
    const startErr = median(found.filter((f) => f.group === "start").map((f) => f.errorFrames));
    const endErr = median(found.filter((f) => f.group === "end").map((f) => f.errorFrames));
    const mStart = found.find((f) => f.group === "start").m;
    const mEnd = found.filter((f) => f.group === "end").at(-1).m;
    const lastSlot = Math.round(toT(wStop) * fps);

    const events = this.raw.map((e) => convertTimes(e, toT));
    // Sync events carry each flash's real position in the master (cut these frames out), plus the
    // time the action clock predicts for it. Labels: start 1..3, end 1..3.
    for (const f of found)
      events.push({ type: "sync", t: r4(f.m), label: `${f.group} ${f.k + 1}`, color: FLASH_COLOR, duration: FLASH_MS / 1000, predicted: toT(f.w) });
    events.sort((a, b) => a.t - b.t);
    events.forEach((e, i) => {
      e.id = i;
    });

    // Frame gaps (browser delivery), split into inside and outside wait ranges. Only meaningful
    // with the heartbeat on (otherwise a still page also produces long gaps).
    const waits = [];
    for (const e of events) if (e.type === "waitStart") {
      const end = events.find((x) => x.type === "waitEnd" && x.label === e.label);
      waits.push([e.t, end ? end.t : Infinity]);
    }
    const ts = this.cast.delivered.map((x) => x - T0 + L);
    let maxOut = { ms: 0, at: null };
    let maxIn = { ms: 0, at: null };
    for (let i = 1; i < ts.length; i++) {
      const a = ts[i - 1];
      const b = ts[i];
      const gap = (b - a) * 1000;
      // The sync flashes are cut from the film; gaps right around them do not count.
      if (found.some((f) => a >= f.m - 0.05 && a <= f.m + 0.3)) continue;
      const inWait = waits.some(([w0, w1]) => a >= w0 && b <= w1 + 0.5);
      const slot = inWait ? maxIn : maxOut;
      if (gap > slot.ms) {
        slot.ms = r2(gap);
        slot.at = r4(a);
      }
    }
    this.gaps = { outsideWaits: maxOut, insideWaits: maxIn, heartbeat: this.session.heartbeat };

    const s = this.session;
    const doc = {
      schema: SCHEMA,
      take: this.name,
      fps,
      viewport: { width: s.width, height: s.height },
      scale: s.scale,
      video: { file: "master.mp4", width: s.width * s.scale, height: s.height * s.scale, frames: lastSlot + 1, duration: r4((lastSlot + 1) / fps) },
      timeBase: "seconds on the master.mp4 clock; t = 0 is the first frame; frame n starts at n / fps",
      coordinates: `CSS px in the ${s.width}x${s.height} viewport, origin top-left; multiply by scale for master pixels`,
      pointerStart: pt(this.pointerStart),
      motion: { ...MOTION },
      calibrationDot: s.calibrationDot,
      events,
    };
    fs.writeFileSync(path.join(this.dir, "events.json"), `${JSON.stringify(doc, null, 2)}\n`);

    const summary = {
      take: this.name,
      mode: s.mode,
      browser: s.version,
      fps,
      scale: s.scale,
      capture: cast,
      sync: {
        flashes: found.map((f) => ({ label: `${f.group} ${f.k + 1}`, t: r4(f.m), latencyMs: r2(f.latency * 1000), errorFrames: f.errorFrames })),
        medianLatencyMs: r2(L * 1000),
        startLatencyMs: r2(Ls * 1000),
        endLatencyMs: r2(Le * 1000),
        latencyChangeFrames: r2((Le - Ls) * fps),
        latencyModel: waitsRaw.length ? "step across the longest wait" : "linear across the take",
        startT: r4(mStart),
        endT: r4(mEnd),
        // Median error of each group: the clock mapping is verified when both are within a frame.
        startErrorFrames: r2(startErr),
        endErrorFrames: r2(endErr),
        driftFrames: r2(endErr - startErr),
        clockDriftMs:
          cast.recvMinusTsEndMs !== undefined ? r2(cast.recvMinusTsEndMs - cast.recvMinusTsStartMs) : null,
        spanSeconds: r4(mEnd - mStart),
        // Footage to keep lies between these (after the last start flash, before the first end flash).
        keep: { from: r4(found.filter((f) => f.group === "start").at(-1).m + FLASH_MS / 1000 + 2 / fps), to: r4(found.find((f) => f.group === "end").m - 1 / fps) },
      },
      gaps: this.gaps,
      warnings: this.warnings,
      dismissed: this.dismissed ?? [],
    };
    if (encode) {
      const enc = await encodeMaster({ dir: this.dir, fps, T0: cast.T0, lastSlot, crf, preset });
      summary.encode = enc;
      summary.master = await probe(path.join(this.dir, "master.mp4"));
      summary.masterSync = await verifyMasterSync(path.join(this.dir, "master.mp4"), fps, found.map((f) => toT(f.w)));
      // Held flashes (onset hidden behind the previous flash on a static page) are left out.
      const errsOf = (list) => list.filter((f) => !f.held).map((f) => f.errorFrames);
      const errs = errsOf(summary.masterSync.flashes);
      const sErr = median(errsOf(summary.masterSync.flashes.slice(0, FLASHES)));
      const eErr = median(errsOf(summary.masterSync.flashes.slice(FLASHES)));
      summary.masterSync.startMedianErrorFrames = r2(sErr);
      summary.masterSync.endMedianErrorFrames = r2(eErr);
      // Pass: in the decoded master, the median error of each flash group is within one frame (the
      // clock mapping holds from start to end) and no single flash is more than two frames off.
      summary.masterSync.pass = Math.abs(sErr) <= 1 && Math.abs(eErr) <= 1 && errs.every((e) => Math.abs(e) <= 2);
    }
    summary.T0 = cast.T0;
    summary.L = L;
    summary.latency = { Ls, Le, wA, wB };
    if (encode && !keepRaw && summary.masterSync?.pass) {
      fs.rmSync(path.join(this.dir, "raw", "frames.bin"));
      summary.rawFramesDeleted = true;
    }
    summary.flashWall = { starts: this.flashStarts, ends: this.flashEnds, stop: wStop, sends: this.flashSends };
    fs.writeFileSync(path.join(this.dir, "take.json"), `${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  }

  /** First stored frame showing the flash, searching from the flash request onward. */
  async findFlashInRaw(w, within = 1.5) {
    const index = readIndex(this.dir).filter((f) => f.ts >= w - 0.02 && f.ts <= w + within);
    if (!index.length) return null;
    const fd = fs.openSync(path.join(this.dir, "raw", "frames.bin"), "r");
    const bufs = index.map((f) => {
      const b = Buffer.allocUnsafe(f.len);
      fs.readSync(fd, b, 0, f.len, f.off);
      return b;
    });
    fs.closeSync(fd);
    const thumbs = await decodeJpegs(bufs);
    const k = thumbs.findIndex((t) => isFlash(t, FLASH_RGB));
    return k < 0 ? null : index[k];
  }

  // ------------------------------------------------------------------ pointer

  async resolve(target, { at } = {}) {
    if (isPoint(target)) return { point: { x: target.x, y: target.y }, box: null };
    let box;
    let row = null;
    if (isBox(target)) box = target;
    else {
      const loc = locate(this.page, target);
      await loc.waitFor({ state: "visible", timeout: 15000 });
      box = await loc.boundingBox();
      if (!box) throw new Error(`no box for target ${target}`);
      const sel = this.session.restGuard?.selector;
      if (sel)
        row = await loc
          .evaluate((el, sel2) => {
            const r = el.closest(sel2);
            if (!r) return null;
            const b = r.getBoundingClientRect();
            return {
              box: { x: b.x, y: b.y, width: b.width, height: b.height },
              scrollLeft: r.scrollLeft,
              max: r.scrollWidth - r.clientWidth,
            };
          }, sel)
          .catch(() => null);
    }
    const s = this.session;
    if (box.y + box.height / 2 < 0 || box.y + box.height / 2 > s.height || box.x + box.width / 2 < 0 || box.x + box.width / 2 > s.width)
      throw new Error(`target is outside the viewport (${JSON.stringify(boxOf(box))}); scroll it in first`);
    const ax = at?.x ?? 0.5;
    const ay = at?.y ?? 0.5;
    return { point: { x: box.x + box.width * ax, y: box.y + box.height * ay }, box, row };
  }

  /**
   * Safe horizontal band of a faded row: a faded edge (content beyond it) reacts to a resting
   * mouse within `zone` px, so the band stops zone + margin px short of it.
   */
  safeBand(row, box) {
    const g = this.session.restGuard;
    const startFaded = row.scrollLeft > 1;
    const endFaded = row.scrollLeft < row.max - 1;
    const lo = Math.max(row.box.x + (startFaded ? g.zone + g.margin : 6), box.x + 6);
    const hi = Math.min(row.box.x + row.box.width - (endFaded ? g.zone + g.margin : 6), box.x + box.width - 6);
    return { lo, hi };
  }

  /** Keep the resting point out of faded hover-scroll edge zones; shift within the box if possible. */
  async guard(point, box) {
    const g = this.session.restGuard;
    if (!g) return { point, trapped: null };
    const zones = await this.page
      .evaluate(([x, y, sel, zone]) => window.__rec?.edgeZones(x, y, sel, zone) ?? [], [point.x, point.y, g.selector, g.zone])
      .catch(() => []);
    const hit = zones.find((z) => z.inStart || z.inEnd);
    if (!hit) return { point, trapped: null };
    const r = hit.box;
    let x = point.x;
    if (hit.inEnd) x = r.x + r.width - g.zone - g.margin;
    if (hit.inStart) x = r.x + g.zone + g.margin;
    const lo = box ? box.x + 6 : -Infinity;
    const hi = box ? box.x + box.width - 6 : Infinity;
    if (x >= lo && x <= hi) return { point: { x, y: point.y }, trapped: null, shifted: true };
    return { point, trapped: hit };
  }

  /** One logged arc from the current pointer position to `to`, stepped at the frame rate. */
  async segment(to, { label, role, duration } = {}) {
    const s = this.session;
    const from = { ...s.pointer };
    if (Math.hypot(to.x - from.x, to.y - from.y) < 0.5) return null;
    const dur = duration ?? moveDuration(from, to);
    const control = controlPoint(from, to);
    this.moving = true;
    const w0 = nowWall();
    const step = 1 / this.fps;
    let k = 1;
    for (;;) {
      const target = w0 + k * step;
      await sleep((target - nowWall()) * 1000);
      const now = nowWall();
      const p = Math.min(1, (now - w0) / dur);
      const pos = p >= 1 ? to : bezier(from, control, to, power3InOut(p));
      await this.page.mouse.move(pos.x, pos.y);
      s.pointer = { x: pos.x, y: pos.y };
      if (p >= 1) break;
      k = Math.max(k + 1, Math.floor((nowWall() - w0) / step) + 1);
    }
    this.moving = false;
    const c = await this.readCursor(to);
    if (c) this.cursorChanged({ ...c, ...to }, w0 + dur);
    return this.log({
      type: "move",
      w: w0,
      wEnd: w0 + dur,
      label,
      role,
      from: pt(from),
      to: pt(to),
      control: pt(control),
      duration: r4(dur),
      cursor: c?.kind ?? null,
      cursorRaw: c?.raw ?? null,
    });
  }

  /**
   * Move the pointer to a point, a box, a CSS selector or a Playwright Locator.
   * `at` picks the spot inside the element box as fractions (default centre).
   */
  async moveTo(target, { label, at, role = "move", duration } = {}) {
    const lbl = this.label("move", label);
    let { point, box, row } = await this.resolve(target, { at });
    const asked = point;
    let guard = null;
    if (row && row.max > 0) {
      // Element inside a faded, scrollable row (chip rows): rest only in the row's safe band.
      let band = this.safeBand(row, box);
      if (band.lo > band.hi) {
        await this.revealInRow(row, box, lbl);
        ({ point, box, row } = await this.resolve(target, { at }));
        band = this.safeBand(row, box);
        guard = "revealed";
        if (band.lo > band.hi) {
          this.warn(`${lbl}: target still outside the safe band of its row after scrolling`);
          band = { lo: point.x, hi: point.x };
        }
      }
      const x = Math.min(band.hi, Math.max(band.lo, point.x));
      if (x !== point.x) {
        point = { x, y: point.y };
        guard ??= "shifted";
      }
    } else {
      const g = await this.guard(point, box);
      if (g.trapped) this.warn(`${lbl}: resting point is inside a hover-scroll edge zone and cannot be shifted`);
      point = g.point;
      if (g.shifted) guard = "shifted";
    }
    const e = await this.segment(point, { label: lbl, role, duration });
    if (e && guard) e.guard = { action: guard, asked: pt(asked) };
    return { move: e, point, box };
  }

  /** Scroll a faded chip row with the wheel so the target leaves the edge zone. */
  async revealInRow(row, box, lbl) {
    const rowCenter = row.box.x + row.box.width / 2;
    const safe = { x: rowCenter, y: row.box.y + row.box.height / 2 };
    const want = box.x + box.width / 2 - rowCenter;
    const dx = Math.round(Math.max(-row.scrollLeft, Math.min(row.max - row.scrollLeft, want)));
    await this.segment(safe, { label: this.label("move", `${lbl} (reveal)`), role: "reveal" });
    await this.scroll({ dx, dy: 0, label: `${lbl} (reveal)` });
    await sleep(120);
  }

  /** Move to a target, arrive `lead` s early, press and release at the logged point. */
  async click(target, { label, at, lead = MOTION.clickLead, press = MOTION.pressSeconds, button = "left", count = 1 } = {}) {
    const lbl = this.label("down", label);
    this.label("up", label);
    const element = target && !isPoint(target) && !isBox(target);
    if (element && this.safeOn("click")) await this.scrollIntoViewSafe(target, { label: `${label} (safe)` });
    const { point, box, move } = await this.moveTo(target, { label, at, role: "approach" });
    const arrived = move?.wEnd ?? nowWall();
    await sleep((arrived + lead - nowWall()) * 1000);
    const liveBox = element ? await locate(this.page, target).boundingBox().catch(() => null) : null;
    // count > 1: a double or triple click; one down/up pair is logged, with clickCount and tEnd.
    const wDown = nowWall();
    for (let i = 1; i <= count; i++) {
      await this.page.mouse.down({ button, clickCount: i });
      await sleep((count > 1 ? 0.05 : press) * 1000);
      await this.page.mouse.up({ button, clickCount: i });
      if (i < count) await sleep(70);
    }
    const wUp = nowWall();
    this.log({ type: "down", w: wDown, label: lbl, at: pt(point), button, box: boxOf(liveBox ?? box), ...(count > 1 ? { clickCount: count } : {}) });
    this.log({ type: "up", w: wUp, label: lbl, at: pt(point), button, ...(count > 1 ? { clickCount: count } : {}) });
    return { point, box: liveBox ?? box };
  }

  /**
   * Type into the focused field with a seeded, slightly irregular cadence.
   * method "insert" (default) inserts text without key events, so the app stays in pointer mode
   * (any keydown switches it to keyboard mode and turns off entrance animations);
   * method "keys" sends real key presses.
   */
  async type(text, { label, cps = 14, seed = 1, method = "insert" } = {}) {
    const lbl = this.label("type", label);
    const field = await this.page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      return { tag: el.tagName.toLowerCase(), id: el.id || null, box: { x: r.x, y: r.y, width: r.width, height: r.height } };
    });
    if (!field) throw new Error(`${lbl}: no focused field to type into (click it first)`);
    const delays = typingDelays(text, { cps, seed });
    const chars = [];
    const w0 = nowWall();
    let due = w0;
    for (let i = 0; i < text.length; i++) {
      due += delays[i];
      await sleep((due - nowWall()) * 1000);
      chars.push(nowWall());
      if (method === "keys") await this.page.keyboard.type(text[i]);
      else await this.page.keyboard.insertText(text[i]);
    }
    const wEnd = nowWall();
    const after = await this.page.evaluate(() => {
      const r = document.activeElement?.getBoundingClientRect();
      return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null;
    });
    return this.log({
      type: "type",
      w: chars[0] ?? w0,
      wEnd,
      label: lbl,
      text,
      method,
      field: { tag: field.tag, id: field.id },
      box: boxOf(field.box),
      boxEnd: boxOf(after),
      chars,
    });
  }

  /**
   * A single key press. Many apps switch to a "keyboard mode" on any keydown (focus rings on,
   * entrance animations off); prefer pointer actions and guardKeys() in app takes.
   */
  async press(key, { label } = {}) {
    const lbl = this.label("key", label);
    const w = nowWall();
    await this.page.keyboard.press(key);
    return this.log({ type: "key", w, label: lbl, key });
  }

  /**
   * Wheel scroll at the pointer (or at `at`, moving there first), spread over `duration` seconds
   * with an ease, like a trackpad flick. Logs the scrolled container and its offsets.
   */
  async scroll({ dy = 0, dx = 0, label, at, duration } = {}) {
    const lbl = this.label("scroll", label);
    if (at) await this.moveTo(at, { label: `${lbl} (position)`, role: "position" });
    const p = this.session.pointer;
    const before = await this.page.evaluate(([x, y]) => window.__rec.scrollerAt(x, y), [p.x, p.y]);
    const dist = Math.hypot(dx, dy);
    const dur = duration ?? Math.min(1.2, Math.max(0.35, 0.25 + dist / 1600));
    const n = Math.max(1, Math.round(dur * this.fps));
    const w0 = nowWall();
    let sentX = 0;
    let sentY = 0;
    for (let k = 1; k <= n; k++) {
      await sleep((w0 + (k - 1) / this.fps - nowWall()) * 1000);
      const e = power3InOut(k / n);
      const tx = Math.round(dx * e);
      const ty = Math.round(dy * e);
      if (tx !== sentX || ty !== sentY) {
        await this.page.mouse.wheel(tx - sentX, ty - sentY);
        sentX = tx;
        sentY = ty;
      }
    }
    const wEnd = nowWall();
    await sleep(150);
    const after = await this.page.evaluate(([x, y]) => window.__rec.scrollerAt(x, y), [p.x, p.y]);
    return this.log({
      type: "scroll",
      w: w0,
      wEnd,
      label: lbl,
      at: pt(p),
      dx,
      dy,
      container: { root: before.root, box: boxOf(before.box) },
      before: { left: before.scrollLeft, top: before.scrollTop },
      after: { left: after.scrollLeft, top: after.scrollTop },
    });
  }

  /**
   * Bring an element into view the way a person would: move the pointer into its scroll container
   * and wheel-scroll until the element sits at `align` (fraction of the container height).
   * Does nothing when the element is already comfortably inside the container and the viewport.
   */
  async reveal(target, { label, align = 0.45, margin = 24, at } = {}) {
    const loc = locate(this.page, target);
    await loc.waitFor({ state: "attached", timeout: 15000 });
    const info = await this.scrollInfo(loc);
    const vTop = Math.max(info.box.y, 0) + margin;
    const vBottom = Math.min(info.box.y + info.box.height, this.session.height) - margin;
    if (info.el.y >= vTop && info.el.y + info.el.height <= vBottom) return null;
    const want = info.el.y + info.el.height / 2 - (info.box.y + info.box.height * align);
    const dy = Math.round(Math.max(-info.top, Math.min(info.max - info.top, want)));
    if (!dy) return null;
    const p = at ?? this.scrollPoint(info);
    return this.scroll({ dy, label, at: p });
  }

  /** Nearest vertical scroll container of an element: element box, container box, offset, range. */
  async scrollInfo(loc) {
    return loc.evaluate((el) => {
      let s = el.parentElement;
      while (s && s !== document.body) {
        const cs = getComputedStyle(s);
        if (/(auto|scroll)/.test(cs.overflowY) && s.scrollHeight > s.clientHeight + 1) break;
        s = s.parentElement;
      }
      const r = el.getBoundingClientRect();
      const root = !s || s === document.body;
      const c = root ? { x: 0, y: 0, width: innerWidth, height: innerHeight } : s.getBoundingClientRect();
      return {
        el: { x: r.x, y: r.y, width: r.width, height: r.height },
        box: { x: c.x, y: c.y, width: c.width, height: c.height },
        top: root ? scrollY : s.scrollTop,
        max: root ? document.documentElement.scrollHeight - innerHeight : s.scrollHeight - s.clientHeight,
      };
    });
  }

  /** Where the pointer goes to wheel-scroll a container: its middle, kept inside the viewport. */
  scrollPoint(info) {
    return {
      x: info.box.x + info.box.width * 0.5,
      y: Math.min(Math.max(info.box.y, 0) + Math.min(info.box.height, this.session.height) * 0.5, this.session.height - 40),
    };
  }

  /** True when the session's safeArea applies to `action` ("click" | "mark"). */
  safeOn(action) {
    const sa = this.session.safeArea;
    return !!sa && (sa.on ?? ["click", "mark"]).includes(action);
  }

  /** `base`, or `base #2`, `base #3`... if a `type` event already uses it in this take. */
  freeLabel(type, base) {
    let l = base;
    for (let n = 2; this.keys.has(`${type}:${l}`); n++) l = `${base} #${n}`;
    return l;
  }

  /**
   * Wheel-scroll (logged, like a person) so the element sits inside the safe band: at least
   * `marginTop` px below the top and `marginBottom` px above the bottom of the viewport (and inside
   * its scroll container). Defaults come from the session's safeArea (top 0, bottom 120). The film
   * crops and scales the frame; a click target at the very bottom of the viewport once lost 70 px
   * of a card in the final cut. An element taller than the band is aligned to the band's top.
   * mode "nearEdge" (used for marks) only scrolls when the element is at least partly on screen and
 * not taller than the band (marks of whole panes never scroll).
   * Returns the scroll event, or null when nothing had to move.
   */
  async scrollIntoViewSafe(target, { marginTop, marginBottom, label, mode = "always" } = {}) {
    const sa = this.session.safeArea ?? {};
    const mTop = marginTop ?? sa.top ?? 0;
    const mBottom = marginBottom ?? sa.bottom ?? 120;
    const loc = locate(this.page, target);
    await loc.waitFor({ state: "visible", timeout: 15000 });
    const H = this.session.height;
    const info = await this.scrollInfo(loc);
    const el = info.el;
    const bandTop = Math.max(info.box.y, 0, mTop);
    const bandBottom = Math.min(info.box.y + info.box.height, H - mBottom);
    // Marks: only an element that is partly on screen and could fit the band (not a whole pane).
    if (mode === "nearEdge" && (el.y >= H || el.y + el.height <= 0 || el.height > bandBottom - bandTop)) return null;
    if (el.y >= bandTop && el.y + el.height <= bandBottom) return null;
    let want = el.height > bandBottom - bandTop || el.y < bandTop ? el.y - bandTop : el.y + el.height - bandBottom;
    const dy = Math.round(Math.max(-info.top, Math.min(info.max - info.top, want)));
    const short = Math.round(Math.abs(want - dy));
    if (short >= 2) this.warn(`${label ?? "safe scroll"}: the container cannot scroll further; the element stays ${short} px outside the safe band`);
    if (Math.abs(dy) < 2) return null;
    const e = await this.scroll({ dy, label: this.freeLabel("scroll", label ?? "safe scroll"), at: this.scrollPoint(info) });
    e.reason = "safe-area";
    if (short >= 2) e.short = short;
    return e;
  }

  /**
   * Logged wait until the page is quiet: no request in flight (network) and no DOM mutation (dom)
   * for `ms` milliseconds, or `timeout` ms. The generic way to wait for an app's work to finish
   * when the project has no app-specific detection. Requests whose URL contains one of
   * `ignoreUrls` (strings or RegExps) do not count; nor do EventSource, media and websockets.
   * Outcomes: "quiet" | "timeout" (with what was still busy).
   */
  async waitQuiet(label, { network = true, dom = true, ms = 800, timeout = 30_000, ignoreUrls = [] } = {}) {
    const ignored = (url) => ignoreUrls.some((p) => (p instanceof RegExp ? p.test(url) : url.includes(p)));
    return this.wait(label, async () => {
      const t0 = nowWall();
      let netIdleSince = null;
      for (;;) {
        const now = nowWall();
        const busy = network ? [...this.session.inflight.keys()].filter((r) => !ignored(r.url())) : [];
        if (busy.length) netIdleSince = null;
        else netIdleSince ??= now;
        const lastMut = dom ? (await this.page.evaluate(() => window.__rec?.lastMutation?.() ?? 0).catch(() => 0)) / 1000 : 0;
        const netQuietMs = netIdleSince === null ? 0 : (now - netIdleSince) * 1000;
        const domQuietMs = dom ? (now - lastMut) * 1000 : Infinity;
        if (netQuietMs >= ms && domQuietMs >= ms) return { outcome: "quiet", seconds: r2(now - t0) };
        if ((now - t0) * 1000 > timeout)
          return { outcome: "timeout", seconds: r2(now - t0), inflight: busy.length, pending: busy.slice(0, 3).map((r) => r.url().slice(0, 120)), domQuietMs: Math.round(Math.min(domQuietMs, 1e9)) };
        await sleep(100);
      }
    });
  }

  /** Move the pointer onto an element and rest there (a hover state the film should show). */
  async hover(target, { label, at, hold = 0.6 } = {}) {
    const r = await this.moveTo(target, { label, at, role: "hover" });
    await this.hold(hold);
    return r;
  }

  /** Log a named element's box at this moment (camera targets, spotlights, caption anchors). */
  async mark(label, target, extra = {}) {
    const lbl = this.label("mark", label);
    let box = null;
    let text;
    if (isBox(target)) box = target;
    else if (target) {
      const loc = locate(this.page, target);
      if (this.safeOn("mark")) await this.scrollIntoViewSafe(loc, { label: `${lbl} (safe)`, mode: "nearEdge" }).catch((e) => this.warn(`mark ${lbl}: ${e.message.split("\n")[0]}`));
      box = await loc.boundingBox();
      // The element's visible text, so captions can be checked against what was on screen.
      text = await loc
        .evaluate((el) => (el.innerText || el.value || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 200))
        .catch(() => undefined);
    }
    const w = nowWall();
    if (!box) throw new Error(`mark ${lbl}: element has no box`);
    return this.log({ type: "mark", w, label: lbl, box: boxOf(box), ...(text ? { text } : {}), ...extra });
  }

  /**
   * Run `fn` as a logged wait. fn returns an outcome string or { outcome, ...detail }.
   * Throws are logged with outcome "failed" and rethrown.
   */
  async wait(label, fn) {
    const lbl = this.label("waitStart", label);
    this.label("waitEnd", label);
    this.log({ type: "waitStart", w: nowWall(), label: lbl });
    try {
      const r = await fn();
      const detail = typeof r === "object" && r ? r : { outcome: r ?? "done" };
      this.log({ type: "waitEnd", w: nowWall(), label: lbl, ...detail });
      return detail;
    } catch (err) {
      this.log({ type: "waitEnd", w: nowWall(), label: lbl, outcome: "failed", error: String(err?.message ?? err) });
      throw err;
    }
  }

  /** Navigate and log it. */
  async nav(url, { label, waitUntil = "load" } = {}) {
    const lbl = this.label("nav", label);
    this.inNav = true;
    const w = nowWall();
    try {
      await this.page.goto(url, { waitUntil });
    } finally {
      this.inNav = false;
    }
    return this.log({ type: "nav", w, wEnd: nowWall(), label: lbl, url: this.page.url() });
  }

  async hold(seconds) {
    await sleep(seconds * 1000);
  }

  /** Current pointer position (CSS px). */
  get pointer() {
    return { ...this.session.pointer };
  }
}

function convertTimes(e, toT) {
  const out = { type: e.type, t: toT(e.w) };
  if (e.wEnd !== undefined) out.tEnd = toT(e.wEnd);
  for (const [k, v] of Object.entries(e)) {
    if (k === "w" || k === "wEnd" || k === "type") continue;
    if (k === "chars") out.chars = v.map(toT);
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

/** Find each flash in the decoded master and compare with the logged time. */
export async function verifyMasterSync(file, fps, times) {
  const flashes = [];
  for (const t of times) {
    const ss = Math.max(0, Math.floor((t - 0.15) * fps) / fps);
    // The flash's first frame is a rising edge. On a static page the previous flash can be held in
    // the constant-rate slots right into this window (no frame arrives until the next change); then
    // this flash's onset cannot be seen in the master and it is marked `held`, not counted as an error.
    let found = null;
    let prev = null;
    let held = false;
    await decodeFrames(file, { width: 16, height: 9, ss, t: 0.4 }, (buf, n) => {
      const on = isFlash(buf, FLASH_RGB);
      if (n === 0 && on && ss > 0) held = true;
      if (found === null && on && (prev === false || (n === 0 && ss === 0))) found = n;
      prev = on;
    });
    // -ss before -i is frame-accurate when re-encoding to rawvideo: frame n is at ss + n/fps.
    const firstFrame = found === null ? null : Math.round(ss * fps) + found;
    flashes.push({
      logged: t,
      measured: firstFrame === null ? null : r4(firstFrame / fps),
      errorFrames: firstFrame === null ? (held ? null : Infinity) : r2(firstFrame - t * fps),
      ...(firstFrame === null && held ? { held: true } : {}),
    });
  }
  return { flashes };
}
