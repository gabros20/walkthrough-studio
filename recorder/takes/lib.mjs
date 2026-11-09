// Generic helpers for take scripts (scenes). Nothing here knows about a particular app: anything
// app-specific (selectors, endpoints, where the mouse may rest) comes from the adapter module or
// from arguments.
import { nowWall, sleep } from "../capture.mjs";

/** Hold still. Pacing used in practice: >= 0.5 s before an action, >= 1.2 s after a visible result. */
export const beat = (take, s = 0.6) => take.hold(s);

/** First visible match of a locator. */
export const visibleFirst = (loc) => loc.filter({ visible: true }).first();

/** Mark if the element exists and has a box; returns false (and records a warning) otherwise. */
export async function markIf(take, label, target, extra = {}) {
  try {
    const loc = typeof target === "string" ? take.page.locator(target).first() : target;
    if (loc && typeof loc.boundingBox === "function") {
      if (!(await loc.count().catch(() => 0))) throw new Error("absent");
      const box = await loc.boundingBox();
      if (!box || box.width < 1) throw new Error("no box");
      if (box.y + box.height < 0 || box.y > take.session.height) extra = { ...extra, offscreen: true };
    }
    await take.mark(label, target, extra);
    return true;
  } catch (err) {
    take.warn(`mark "${label}" skipped: ${err.message.split("\n")[0]}`);
    return false;
  }
}

/** Mark every visible element of a locator: label = `${prefix} ${name(i, text)}`. */
export async function markEach(take, prefix, loc, name = (i, text) => text || String(i + 1)) {
  const n = await loc.count();
  for (let i = 0; i < n; i++) {
    const el = loc.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const text = ((await el.getAttribute("aria-label").catch(() => null)) || (await el.innerText().catch(() => ""))).replace(/\s+/g, " ").trim().slice(0, 48);
    await markIf(take, `${prefix} ${name(i, text)}`, el, { text });
  }
}

/** Box of a text run inside an element (e.g. one sentence of a paragraph), or null. */
export async function textBox(loc, needle) {
  return loc.evaluate((el, needle2) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.textContent.indexOf(needle2);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(node, i);
      r.setEnd(node, i + needle2.length);
      const rects = [...r.getClientRects()];
      const x0 = Math.min(...rects.map((q) => q.left));
      const y0 = Math.min(...rects.map((q) => q.top));
      const x1 = Math.max(...rects.map((q) => q.right));
      const y1 = Math.max(...rects.map((q) => q.bottom));
      return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    }
    return null;
  }, needle);
}

/** Caret point right after the first occurrence of `after` in an element's text (click there to edit). */
export async function caretAfter(loc, after) {
  return loc.evaluate((el, after2) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const i = node.textContent.indexOf(after2);
      if (i < 0) continue;
      const r = document.createRange();
      r.setStart(node, i + after2.length - 1);
      r.setEnd(node, i + after2.length);
      const q = r.getBoundingClientRect();
      return { x: q.right + 1, y: q.top + q.height / 2 };
    }
    return null;
  }, after);
}

/**
 * Wheel-scroll the first scrollable element inside `container` (a Locator) to its end, logged.
 * Returns null when it is already within 4 px of the end.
 */
export async function scrollToEnd(take, container, label, { maxHeight = 700 } = {}) {
  const info = await container.evaluate((pane) => {
    for (const el of [pane, ...pane.querySelectorAll("*")]) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1) {
        const r = el.getBoundingClientRect();
        return { left: el.scrollHeight - el.clientHeight - el.scrollTop, box: { x: r.x, y: r.y, width: r.width, height: r.height } };
      }
    }
    return null;
  });
  if (!info || info.left < 4) return null;
  const at = { x: info.box.x + info.box.width * 0.5, y: info.box.y + Math.min(info.box.height, maxHeight) * 0.5 };
  return take.scroll({ dy: Math.round(info.left), label, at });
}

/**
 * Where the mouse may rest without triggering any hover state. Asks the adapter's
 * parkPoint(page, config) first, then config.project.parkPoint, then a bottom-right margin.
 * Never park on tiles, chips, images or anything with a hover effect.
 */
export async function parkPoint(take) {
  const s = take.session;
  if (typeof s.adapter?.parkPoint === "function") {
    const p = await s.adapter.parkPoint(take.page, s.config);
    if (p) return p;
  }
  if (s.config?.project?.parkPoint) return s.config.project.parkPoint;
  return { x: Math.round(s.width * 0.82), y: Math.round(s.height * 0.79) };
}

/** Move the mouse to the park point (a logged move, role "park"). Label convention: "<action> park". */
export async function park(take, label) {
  const p = await parkPoint(take);
  const cur = take.pointer;
  if (Math.hypot(cur.x - p.x, cur.y - p.y) < 4) return null;
  return take.moveTo(p, { label, role: "park" });
}

/** Click, then park the mouse off anything with a hover state. */
export async function clickPark(take, target, opts) {
  const r = await take.click(target, opts);
  await park(take, `${opts.label} park`);
  return r;
}

/**
 * Refuse key presses that spoil a take (default Enter and Escape: sending belongs to the pointer,
 * and Escape often cancels a running request). Returns the same take.
 */
export function guardKeys(take, keys = ["Enter", "Escape"]) {
  const press = take.press.bind(take);
  const re = new RegExp(`^(${keys.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`, "i");
  take.press = (key, opts) => {
    if (re.test(key)) throw new Error(`${key} is not allowed in this take (guardKeys)`);
    return press(key, opts);
  };
  return take;
}

/**
 * Watches requests that match `match(request)` from the moment it is created. Detect the end of an
 * app's work from the network, never from translated labels or spinners.
 */
export class NetworkWatcher {
  constructor(page, match) {
    this.page = page;
    this.inflight = new Set();
    this.started = 0;
    this.finished = 0;
    this.failed = 0;
    this.statuses = [];
    this.firstAt = null;
    this.lastEndAt = null;
    this.onRequest = (req) => {
      if (!match(req)) return;
      this.inflight.add(req);
      this.started++;
      this.firstAt ??= nowWall();
    };
    this.onDone = (req, failed) => {
      if (!this.inflight.delete(req)) return;
      if (failed) this.failed++;
      else this.finished++;
      this.lastEndAt = nowWall();
    };
    this.onFinished = (req) => {
      if (!this.inflight.has(req)) return;
      req
        .response()
        .then((r) => r && this.statuses.push(r.status()))
        .catch(() => {});
      this.onDone(req, false);
    };
    this.onFailed = (req) => this.onDone(req, true);
    page.on("request", this.onRequest);
    page.on("requestfinished", this.onFinished);
    page.on("requestfailed", this.onFailed);
  }

  dispose() {
    this.page.off("request", this.onRequest);
    this.page.off("requestfinished", this.onFinished);
    this.page.off("requestfailed", this.onFailed);
  }
}

/** Matcher for NetworkWatcher / waitForResponse: method + exact pathname. */
export const requestIs = (method, pathname) => (req) => req.method() === method && new URL(req.url()).pathname === pathname;

/**
 * Wait for a network-driven turn (an agent reply, a long save) to end, as a logged wait.
 * The turn has ended when no watched request is in flight and `calm()` is true, both held for
 * `settleMs`. Apps often send follow-up requests on their own (tool results, automatic resends),
 * so the first response is not the end. `classify()` returns the outcome string (read it from DOM
 * structure, not from translated text); `detail()` adds fields to the waitEnd event.
 * Outcomes added here: not-sent (no request within startTimeout), timeout.
 */
export async function waitForNetworkTurn(
  take,
  watcher,
  { label, calm = async () => true, classify = async () => "done", detail = async () => ({}), timeout = 6 * 60_000, settleMs = 1000, startTimeout = 15_000 } = {},
) {
  return take.wait(label, async () => {
    const t0 = nowWall();
    try {
      while (!watcher.started) {
        if ((nowWall() - t0) * 1000 > startTimeout) return { outcome: "not-sent" };
        await sleep(100);
      }
      let calmSince = null;
      for (;;) {
        if ((nowWall() - t0) * 1000 > timeout) return { outcome: "timeout", requests: watcher.started };
        const ok = watcher.inflight.size === 0 && (await calm());
        if (ok) {
          calmSince ??= nowWall();
          if ((nowWall() - calmSince) * 1000 >= settleMs) break;
        } else calmSince = null;
        await sleep(200);
      }
      return {
        outcome: await classify(),
        requests: watcher.started,
        failedRequests: watcher.failed,
        statuses: watcher.statuses,
        seconds: Math.round((watcher.lastEndAt - watcher.firstAt) * 10) / 10,
        ...(await detail()),
      };
    } finally {
      watcher.dispose();
    }
  });
}

/**
 * Click a field, type `text` with the natural cadence (insertText: no key events), check the field
 * holds it, then click Send with the pointer. Never press Enter to send: a keydown can flip the app
 * into keyboard mode for the rest of the take. Returns the NetworkWatcher (created before the
 * click) for waitForNetworkTurn.
 * Labels written: "<label> field" (move/down/up), "<label> text" (type), "<label> send" (move/down/up).
 */
export async function typeAndSend(take, { field, send, text, label, match, cps = 14, seed = 1, at = { x: 0.25, y: 0.5 } }) {
  await take.click(field, { label: `${label} field`, at });
  await take.type(text, { label: `${label} text`, cps, seed, method: "insert" });
  const value = await field.inputValue().catch(() => field.innerText());
  if (value.trim() !== text.trim()) throw new Error(`${label}: field holds "${value}", expected the typed text`);
  if (await send.isDisabled().catch(() => false)) throw new Error(`${label}: Send is disabled`);
  const watcher = new NetworkWatcher(take.page, match);
  await take.click(send, { label: `${label} send` });
  return watcher;
}

/**
 * Upload a file by clicking the app's own upload control with the pointer. The file chooser is
 * intercepted (no OS dialog appears and nothing is drawn). `response` matches the upload's
 * response; `shown` (optional Locator or selector) must become visible for the outcome "success".
 * Logged: the click "<label>", then the wait "<label> upload".
 */
export async function uploadWithChooser(take, target, filePath, { label, response = null, shown = null, timeout = 30_000 }) {
  const page = take.page;
  const chooser = page.waitForEvent("filechooser", { timeout: 10_000 });
  // Read the body as soon as the response arrives: DevTools evicts response bodies from its cache
  // quickly while the screencast is running, so reading it later fails.
  const resp = response
    ? page.waitForResponse(response, { timeout }).then(async (r) => ({ r, text: await r.text().catch(() => null) }))
    : null;
  resp?.catch(() => {});
  await take.click(target, { label });
  await (await chooser).setFiles(filePath);
  return take.wait(`${label} upload`, async () => {
    const { r = null, text = null } = resp ? await resp : {};
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {}
    const visible = shown
      ? await (typeof shown === "string" ? page.locator(shown) : shown)
          .first()
          .waitFor({ state: "visible", timeout: 8000 })
          .then(() => true)
          .catch(() => false)
      : true;
    return { outcome: (!r || r.ok()) && visible ? "success" : "failed", status: r?.status() ?? null, body };
  });
}

/**
 * Run `sideFn()` every `intervalMs` while `promise` is pending (e.g. mark a status line each time
 * its text changes during an agent turn). Errors inside sideFn are ignored.
 */
export async function whilePending(promise, sideFn, intervalMs = 400) {
  let done = false;
  const side = (async () => {
    while (!done) {
      try {
        await sideFn();
      } catch {}
      await sleep(intervalMs);
    }
  })();
  try {
    return await promise;
  } finally {
    done = true;
    await side;
  }
}

/** take.waitQuiet(label, opts): network idle and no DOM mutations for `ms` (see take.mjs). */
export const waitQuiet = (take, label, opts) => take.waitQuiet(label, opts);

/** take.scrollIntoViewSafe(target, opts): scroll the element inside the safe band (see take.mjs). */
export const scrollIntoViewSafe = (take, target, opts) => take.scrollIntoViewSafe(target, opts);
