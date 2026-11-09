// Tour map: crawl a site before any scene exists (nothing is recorded), and write what an agent needs
// to draft scenes against real labels instead of guesses.
//
//   node recorder/tools/explore.mjs <url> [--config <walkthrough.config.mjs>] [--depth 2]
//        [--max-pages 20] [--storage <state.json>] [--viewport desktop|phone] [--out <dir>]
//        [--delay 300] [--ignore-robots]
//
// Breadth-first over same-site links (same host) from <url> (default: the config's baseUrl), one page at a
// time with --delay ms between requests. Never clicks, types or submits anything; links that look
// like downloads, mail or phone links, other hosts, hash-only jumps, or destructive or sign-out
// paths are not followed; robots.txt Disallow rules for * are honoured unless --ignore-robots. With
// a config: its viewport, storageState, blockUrls and dismiss (clicked on each page) apply.
//
// Writes into --out (default: the current folder):
//   tour-map.json      schema "walkthrough-tour-map/1": per page url, title, landmarks, headings
//                      (h1-h3), interactive controls from the accessibility tree (role, name, box,
//                      visible text, href; at most 80 per page) and the thumbnail path
//   tour-map.md        the same, one section per page with a controls table
//   thumbs/<n>.jpg     480 px wide viewport thumbnail of page n
//   scenes.draft.json  one declarative scene per page (nav, wait quiet, mark of the h1 "headline", up
//                      to 5 clicks on primary controls, hold); destructive-sounding controls are
//                      listed under "_skipped". Edit it into the project's scenes.json.
//
// Also exports withSession(fn, { state }) and outline(page) for one-off exploration scripts.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sleep } from "../capture.mjs";
import { openSession } from "../take.mjs";

export async function withSession(fn, { state, save = true, ...opts } = {}) {
  const session = await openSession({
    ...opts,
    storageState: state && fs.existsSync(state) ? state : undefined,
  });
  try {
    return await fn(session.page, session);
  } finally {
    if (state && save) await session.context.storageState({ path: state }).catch(() => {});
    await session.close();
  }
}

/** Short text dump of interactive elements in view, for orientation. */
export async function outline(page, root = "body") {
  return page.evaluate((sel) => {
    const out = [];
    const r0 = document.querySelector(sel);
    for (const el of r0.querySelectorAll("button, a[href], input, textarea, select, [role=button], [role=tab], [role=menuitem], [role=option], [role=radio], [contenteditable=true], h1, h2, h3, img")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight) continue;
      const label = el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("alt") || el.textContent.trim().replace(/\s+/g, " ").slice(0, 60);
      const attrs = [...el.attributes].filter((a) => a.name.startsWith("data-") || ["id", "type", "role", "name", "aria-pressed", "aria-selected", "aria-checked", "aria-expanded"].includes(a.name)).map((a) => `${a.name}=${a.value.slice(0, 40)}`).join(" ");
      out.push(`${el.tagName.toLowerCase()} [${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}] "${label}" ${attrs}`);
    }
    return out.join("\n");
  }, root);
}

// ---------------------------------------------------------------------------------- tour map

export const TOUR_MAP_SCHEMA = "walkthrough-tour-map/1";
const MAX_CONTROLS = 80;
const MAX_CLICKS = 5;
const INTERACTIVE = new Set(["button", "link", "textbox", "searchbox", "combobox", "checkbox", "radio", "switch", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "option", "slider", "spinbutton", "listbox", "treeitem"]);
const LANDMARKS = new Set(["banner", "navigation", "main", "contentinfo", "complementary", "search", "form", "region", "dialog", "alertdialog"]);
const FILE_EXT = /\.(pdf|zip|gz|tgz|rar|7z|dmg|exe|msi|pkg|deb|rpm|apk|csv|xlsx?|docx?|pptx?|odt|mp4|mov|webm|mp3|wav|ogg|png|jpe?g|gif|webp|avif|svg|ico|json|xml|txt|rss|atom)$/i;
/** Names and paths a draft must not click and the crawler must not follow. */
export const DESTRUCTIVE = /\b(delete|remove|erase|destroy|discard|pay|payment|checkout|check out|purchase|buy|order now|place order|sign ?out|log ?out|logout|signout|unsubscribe|deactivate|close account|cancel (my )?(subscription|plan|account|order)|transfer|send money|reset|revoke|archive)\b/i;
/** Names a draft leaves out because they send or submit something. */
const SUBMITS = /\b(send|submit|subscribe|sign ?up|register|post|publish|confirm|apply|donate)\b/i;
const CONSENT = /\b(cookies?|consent|accept all|reject all|allow all|necessary only)\b/i;

const r1 = (v) => Math.round(v * 10) / 10;
const clip = (s, n) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const slug = (s, n = 32) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, n)
    .replace(/-+$/g, "") || "page";
const keyOf = (u) => `${u.pathname}${u.search}`;
const hostOf = (href) => {
  try {
    return new URL(href).host;
  } catch {
    return null;
  }
};
/**
 * Same site: same host (and port). A plain-http link to the host of an https start is upgraded to
 * https in place (old pages often link with http:// to themselves); returns false for other hosts.
 */
function sameSite(u, start) {
  if (u.host !== start.host || !/^https?:$/.test(u.protocol)) return false;
  if (u.protocol !== start.protocol) u.protocol = start.protocol;
  return true;
}

/** robots.txt Disallow prefixes for User-agent: * (empty on any error). */
async function robotsRules(origin) {
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5000), redirect: "follow" });
    if (!res.ok) return [];
    const lines = (await res.text()).split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim());
    const rules = [];
    let agents = [];
    let inGroup = false;
    for (const l of lines) {
      const m = l.match(/^([a-z-]+)\s*:\s*(.*)$/i);
      if (!m) continue;
      const [, k, v] = m;
      if (/^user-agent$/i.test(k)) {
        if (inGroup) agents = [];
        inGroup = false;
        agents.push(v.trim());
      } else {
        inGroup = true;
        if (/^disallow$/i.test(k) && v && agents.includes("*")) rules.push(v.trim());
      }
    }
    return rules;
  } catch {
    return [];
  }
}
const disallowed = (rules, pathname) => rules.some((r) => (r.endsWith("$") ? pathname === r.slice(0, -1) : pathname.startsWith(r.replace(/\*.*$/, ""))));

/** Interactive controls, landmarks and headings from the page's accessibility tree (CDP). */
async function readAccessibility(page, cdp, viewport) {
  const { nodes } = await cdp.send("Accessibility.getFullAXTree");
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  const role = (n) => n?.role?.value ?? "";
  const name = (n) => n?.name?.value ?? "";
  const prop = (n, k) => n.properties?.find((p) => p.name === k)?.value?.value;
  const landmarkOf = (n) => {
    for (let p = byId.get(n.parentId); p; p = byId.get(p.parentId)) if (LANDMARKS.has(role(p))) return { role: role(p), name: name(p) || undefined };
    return null;
  };
  const landmarks = [];
  const headings = [];
  const candidates = [];
  for (const n of nodes) {
    if (n.ignored) continue;
    const r = role(n);
    if (LANDMARKS.has(r) && r !== "dialog" && r !== "alertdialog" && (r !== "region" || name(n))) landmarks.push({ role: r, ...(name(n) ? { name: clip(name(n), 80) } : {}) });
    if (r === "heading") {
      const level = Number(prop(n, "level") ?? 2);
      if (level <= 3 && name(n)) headings.push({ level, text: clip(name(n), 160) });
    }
    if (INTERACTIVE.has(r) && n.backendDOMNodeId) candidates.push(n);
  }
  await cdp.send("DOM.getDocument", { depth: 0 });
  const describe = async (backendNodeId) => {
    const { object } = await cdp.send("DOM.resolveNode", { backendNodeId, objectGroup: "explore" });
    const { result } = await cdp.send("Runtime.callFunctionOn", {
      objectId: object.objectId,
      returnByValue: true,
      functionDeclaration: `function () {
        const el = this.nodeType === 1 ? this : this.parentElement;
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true);
        const a = el.closest("a[href], area[href]");
        return {
          box: { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height },
          visible,
          text: (el.innerText || el.value || "").replace(/\\s+/g, " ").trim(),
          href: a ? a.href : null,
          download: a ? a.hasAttribute("download") : false,
          disabled: !!el.disabled || el.getAttribute("aria-disabled") === "true",
        };
      }`,
    });
    return result.value;
  };
  const controls = [];
  let total = 0;
  for (const n of candidates) {
    const d = await describe(n.backendDOMNodeId).catch(() => null);
    if (!d?.visible) continue;
    total++;
    if (controls.length >= MAX_CONTROLS) continue;
    const lm = landmarkOf(n);
    controls.push({
      role: role(n),
      name: clip(name(n), 120),
      text: clip(d.text, 80),
      ...(d.href ? { href: d.href } : {}),
      box: { x: r1(d.box.x), y: r1(d.box.y), width: r1(d.box.width), height: r1(d.box.height) },
      inView: d.box.y < viewport.height && d.box.y + d.box.height > 0 && d.box.x < viewport.width,
      ...(lm ? { landmark: lm.role, ...(lm.name ? { landmarkName: clip(lm.name, 60) } : {}) } : {}),
      ...(d.disabled ? { disabled: true } : {}),
      ...(d.download ? { download: true } : {}),
    });
  }
  await cdp.send("Runtime.releaseObjectGroup", { objectGroup: "explore" }).catch(() => {});
  return { landmarks, headings, controls, controlsTotal: total };
}

/** Same-site links worth following, and the ones left out with why. */
async function readLinks(page, start) {
  const raw = await page.evaluate(() =>
    [...document.querySelectorAll("a[href], area[href]")].map((a) => ({ href: a.href, raw: a.getAttribute("href") ?? "", download: a.hasAttribute("download"), text: (a.innerText || a.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 80) })),
  );
  const here = new URL(page.url());
  const follow = [];
  const skipped = [];
  for (const l of raw) {
    let u;
    try {
      u = new URL(l.href);
    } catch {
      continue;
    }
    const why = /^(mailto|tel|sms|javascript|data|blob):$/i.test(u.protocol)
      ? `${u.protocol.replace(":", "")} link`
      : !sameSite(u, start)
        ? "other site"
        : l.raw.startsWith("#") || (keyOf(u) === keyOf(here) && u.hash)
          ? "hash-only"
          : l.download || FILE_EXT.test(u.pathname)
            ? "download"
            : DESTRUCTIVE.test(u.pathname) || DESTRUCTIVE.test(l.text)
              ? "destructive or sign-out link"
              : null;
    if (why) skipped.push({ url: u.href, reason: why });
    else follow.push(u);
  }
  return { follow, skipped };
}

/** 480 px wide JPEG of the viewport (ffmpeg scales the CSS-px screenshot). */
async function thumbnail(page, file) {
  const buf = await page.screenshot({ type: "jpeg", quality: 85, scale: "css" });
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-i", "-", "-vf", "scale=480:-2:flags=lanczos", "-q:v", "4", file], { input: buf });
  if (r.status !== 0) throw new Error(`ffmpeg thumbnail: ${String(r.stderr).trim().split("\n")[0]}`);
}

/** Which controls a draft scene clicks (at most 5), and which it leaves out with a reason. */
export function pickClicks(controls, pageUrl = null) {
  const host = pageUrl ? new URL(pageUrl).host : null;
  // A page with no navigation or header links (older markup, no landmarks): fall back to same-site
  // links in the first viewport.
  const navLinks = controls.some((c) => c.role === "link" && ["navigation", "banner"].includes(c.landmark));
  const fallbackLink = (c) => !navLinks && c.inView && !c.landmark && !!c.href && !!host && hostOf(c.href) === host && !c.href.includes("#");
  const skipped = [];
  const picks = [];
  const seen = new Set();
  for (const [i, c] of controls.entries()) {
    if (c.role !== "button" && c.role !== "link") continue;
    if (!c.name || c.disabled) continue;
    const reason = DESTRUCTIVE.test(c.name)
      ? `destructive-sounding name ("${c.name.match(DESTRUCTIVE)[0]}")`
      : CONSENT.test(c.name) || c.landmark === "dialog" || c.landmark === "alertdialog"
        ? "consent banner or dialog (put it in the config's dismiss list)"
        : SUBMITS.test(c.name)
          ? `sends or submits something ("${c.name.match(SUBMITS)[0]}")`
          : null;
    if (reason) {
      skipped.push({ role: c.role, name: c.name, reason });
      continue;
    }
    if (c.download || c.landmark === "contentinfo") continue;
    // Links only from navigation and the page header: they are on every page, so later clicks in
    // the scene still find them after a link has navigated.
    if (c.role === "link" && !["navigation", "banner"].includes(c.landmark) && !fallbackLink(c)) continue;
    if (c.role === "link" && c.href && /^(mailto|tel):/i.test(c.href)) continue;
    const key = `${c.role}|${c.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const score = (c.role === "button" ? (c.landmark === "main" ? 3 : 1) : 2) + (c.inView ? 1 : 0);
    picks.push({ c, score, i });
  }
  // Buttons first (they usually stay on the page), then links (they navigate); by score, then page
  // order. Fallback links (not in a nav) are on this page only: one, last, since it navigates away.
  picks.sort((a, b) => (a.c.role === b.c.role ? b.score - a.score || a.i - b.i : a.c.role === "button" ? -1 : 1));
  let clicks = picks.slice(0, MAX_CLICKS).map((p) => p.c);
  if (!navLinks) {
    const firstLink = clicks.find((c) => c.role === "link");
    clicks = [...clicks.filter((c) => c.role !== "link"), ...(firstLink ? [firstLink] : [])];
  }
  return { clicks, skipped };
}

/** One declarative scene for a page of the tour map. */
export function draftScene(page, n, origin) {
  const u = new URL(page.url);
  const where = u.host === new URL(origin).host ? keyOf(u) : page.url;
  const short = slug(page.title || u.pathname, 24);
  const h1 = page.headings.find((h) => h.level === 1);
  const { clicks, skipped } = pickClicks(page.controls, page.url);
  const steps = [
    { nav: where, label: `open ${short}` },
    { wait: "quiet", label: `${short} loaded` },
  ];
  if (h1) steps.push({ mark: { role: "heading", name: h1.text.replace(/…$/, ""), exact: !h1.text.endsWith("…") }, label: "headline" });
  steps.push({ hold: 0.8 });
  const labels = new Set();
  for (const c of clicks) {
    let label = `click ${clip(c.name.toLowerCase(), 40)}`;
    for (let k = 2; labels.has(label); k++) label = `click ${clip(c.name.toLowerCase(), 36)} #${k}`;
    labels.add(label);
    steps.push({ click: { role: c.role, name: c.name, exact: true }, label });
    if (c.role === "link") steps.push({ wait: "quiet", label: `after ${label}` });
    else steps.push({ hold: 0.8 });
  }
  steps.push({ hold: 1.2 });
  return { name: `page-${n}-${slug(page.title || u.pathname, 30)}`, _from: page.url, steps, ...(skipped.length ? { _skipped: skipped } : {}) };
}

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

/** tour-map.md from the tour map document. */
export function tourMapMarkdown(doc) {
  const out = [];
  out.push(`# Tour map: ${doc.origin}`, "");
  out.push(`Crawled ${doc.createdAt} from ${doc.startUrl}: depth ${doc.options.depth}, at most ${doc.options.maxPages} pages, ${doc.options.delayMs} ms between pages, viewport ${doc.viewport.preset} ${doc.viewport.width}x${doc.viewport.height}${doc.options.storageState ? ", signed in (storage state)" : ""}. ${doc.pages.length} pages, ${doc.skipped.length} links not followed.`, "");
  out.push("Boxes are CSS px from the top-left of the page at scroll 0; `in view` = inside the first viewport. Controls are the visible interactive nodes of the accessibility tree, at most 80 per page.", "");
  for (const p of doc.pages) {
    out.push(`## ${p.n}. ${p.title || "(no title)"}`, "");
    out.push(`- URL: ${p.url}${p.status ? ` (HTTP ${p.status})` : ""}`);
    out.push(`- Depth ${p.depth}${p.from ? `, linked from ${p.from}` : " (start)"}`);
    if (p.error) out.push(`- Error: ${p.error}`);
    out.push(`- Landmarks: ${p.landmarks.length ? p.landmarks.map((l) => (l.name ? `${l.role} "${l.name}"` : l.role)).join(", ") : "none"}`);
    out.push(`- Headings:${p.headings.length ? "" : " none"}`);
    for (const h of p.headings.slice(0, 20)) out.push(`  - h${h.level} ${h.text}`);
    if (p.headings.length > 20) out.push(`  - ... ${p.headings.length - 20} more`);
    if (p.thumb) out.push(`- Thumbnail: [${p.thumb}](${p.thumb})`);
    out.push(`- Controls: ${p.controls.length}${p.controlsTotal > p.controls.length ? ` of ${p.controlsTotal} (capped)` : ""}`, "");
    if (p.controls.length) {
      out.push("| # | role | name | text | href | box (x, y, w x h) | in view | landmark |", "|---|---|---|---|---|---|---|---|");
      for (const [i, c] of p.controls.entries())
        out.push(`| ${i + 1} | ${c.role} | ${cell(c.name)} | ${cell(c.text !== c.name ? c.text : "")} | ${cell(c.href ? c.href.replace(doc.origin, "") : "")} | ${c.box.x}, ${c.box.y}, ${c.box.width} x ${c.box.height} | ${c.inView ? "yes" : ""} | ${cell(c.landmark ? `${c.landmark}${c.landmarkName ? ` "${c.landmarkName}"` : ""}` : "")} |`);
      out.push("");
    }
  }
  if (doc.skipped.length) {
    out.push("## Links not followed", "");
    const byReason = new Map();
    for (const s of doc.skipped) byReason.set(s.reason, [...(byReason.get(s.reason) ?? []), s.url]);
    for (const [reason, urls] of byReason) out.push(`- ${reason} (${urls.length}): ${[...new Set(urls)].slice(0, 8).join(", ")}${urls.length > 8 ? ", ..." : ""}`);
    out.push("");
  }
  return `${out.join("\n")}\n`;
}

/** Crawl and write tour-map.json, tour-map.md, thumbs/ and scenes.draft.json into `out`. */
export async function explore({ url, config, depth = 2, maxPages = 20, delayMs = 300, out = ".", ignoreRobots = false, log = console.log }) {
  const { sessionOptions } = await import("../config.mjs");
  const start = new URL(url);
  const origin = start.origin;
  fs.mkdirSync(path.join(out, "thumbs"), { recursive: true });
  const rules = ignoreRobots ? [] : await robotsRules(origin);
  const { storageState, ...opts } = sessionOptions(config, { heartbeat: false, calibrationDot: false, popups: "block", dialogs: "dismiss" });
  const pages = [];
  const skipped = [];
  const seen = new Set([keyOf(start)]);
  const queue = [{ url: start.href, depth: 0, from: null }];
  let first = true;
  await withSession(
    async (page, session) => {
      while (queue.length && pages.length < maxPages) {
        const item = queue.shift();
        const u = new URL(item.url);
        if (disallowed(rules, u.pathname)) {
          skipped.push({ url: item.url, reason: "robots.txt" });
          continue;
        }
        if (!first) await sleep(delayMs);
        first = false;
        const n = pages.length + 1;
        const rec = { n, url: item.url, depth: item.depth, from: item.from, title: "", landmarks: [], headings: [], controls: [], controlsTotal: 0 };
        log(`explore ${n}: ${item.url}`);
        try {
          const res = await page.goto(item.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
          rec.status = res?.status() ?? null;
          await page.waitForLoadState("load", { timeout: 10_000 }).catch(() => {});
          await page.waitForLoadState("networkidle", { timeout: 4_000 }).catch(() => {});
          await session.dismissBanners();
          await sleep(300);
          const final = new URL(page.url());
          if (final.host !== start.host) {
            skipped.push({ url: item.url, reason: `redirected to another site (${final.origin})` });
            continue;
          }
          if (keyOf(final) !== keyOf(u)) {
            rec.url = final.href;
            if (pages.some((p) => keyOf(new URL(p.url)) === keyOf(final))) {
              skipped.push({ url: item.url, reason: `redirects to a page already mapped (${keyOf(final)})` });
              continue;
            }
            seen.add(keyOf(final));
          }
          rec.title = clip(await page.title(), 160);
          Object.assign(rec, await readAccessibility(page, session.cdp, { width: session.width, height: session.height }));
          await thumbnail(page, path.join(out, "thumbs", `${n}.jpg`));
          rec.thumb = `thumbs/${n}.jpg`;
          const links = await readLinks(page, start);
          skipped.push(...links.skipped);
          rec.links = links.follow.length;
          if (item.depth < depth)
            for (const l of links.follow) {
              if (seen.has(keyOf(l))) continue;
              seen.add(keyOf(l));
              queue.push({ url: `${l.origin}${keyOf(l)}`, depth: item.depth + 1, from: rec.url });
            }
        } catch (err) {
          rec.error = String(err?.message ?? err).split("\n")[0];
          log(`  ${rec.error}`);
        }
        pages.push(rec);
      }
    },
    { ...opts, state: storageState, save: false },
  );
  const uniq = [];
  const sk = new Set();
  for (const s of skipped) {
    const k = `${s.url}|${s.reason}`;
    if (sk.has(k)) continue;
    sk.add(k);
    uniq.push(s);
  }
  const doc = {
    schema: TOUR_MAP_SCHEMA,
    startUrl: start.href,
    origin,
    createdAt: new Date().toISOString(),
    viewport: { preset: config.preset, width: config.viewport.width, height: config.viewport.height, scale: config.scale },
    options: { depth, maxPages, delayMs, robots: ignoreRobots ? "ignored" : rules.length ? `${rules.length} disallow rules` : "none", storageState: !!storageState, blockUrls: (config.blockUrls ?? []).map(String), dismiss: config.dismiss ?? [] },
    pages,
    unvisited: queue.map((q) => q.url),
    skipped: uniq,
  };
  fs.writeFileSync(path.join(out, "tour-map.json"), `${JSON.stringify(doc, null, 2)}\n`);
  fs.writeFileSync(path.join(out, "tour-map.md"), tourMapMarkdown(doc));
  const draft = {
    _note: `Drafted by recorder/tools/explore.mjs from ${start.href} on ${doc.createdAt.slice(0, 10)}. One scene per page: nav, wait, the h1 as "headline", up to ${MAX_CLICKS} clicks on primary controls (buttons first, then navigation links), hold. Edit into scenes.json: cut and reorder steps, add type/hover/scroll, replace the first nav with "start" to open the page off camera. Controls under _skipped were left out on purpose. Paths are relative to baseUrl ${origin}.`,
    baseUrl: origin,
    scenes: pages.filter((p) => !p.error).map((p) => draftScene(p, p.n, origin)),
  };
  fs.writeFileSync(path.join(out, "scenes.draft.json"), `${JSON.stringify(draft, null, 2)}\n`);
  return { doc, draft };
}

// ---------------------------------------------------------------------------------- CLI

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { defaultConfig, loadConfig, parseArgs } = await import("../config.mjs");
  const { flags, rest } = parseArgs(process.argv.slice(2), ["ignore-robots", "help"]);
  const usage = "usage: explore.mjs <url> [--config <walkthrough.config.mjs>] [--depth 2] [--max-pages 20] [--storage <state.json>] [--viewport desktop|phone] [--out <dir>] [--delay 300] [--ignore-robots]";
  if (flags.help) {
    console.log(usage);
    process.exit(0);
  }
  const overrides = { storageState: flags.storage, viewport: flags.viewport };
  const config = flags.config ? await loadConfig(flags.config, overrides) : defaultConfig(overrides);
  const url = rest[0] ?? (flags.config ? config.baseUrl : null);
  if (!url || !/^https?:\/\//i.test(url)) {
    console.error(url ? `explore.mjs: not an http(s) URL: ${url}` : usage);
    process.exit(2);
  }
  const num = (v, d, name) => {
    if (v === undefined) return d;
    const x = Number(v);
    if (!Number.isFinite(x) || x < 0) {
      console.error(`explore.mjs: --${name} needs a number >= 0`);
      process.exit(2);
    }
    return x;
  };
  const out = path.resolve(flags.out ?? ".");
  const { doc } = await explore({
    url,
    config,
    depth: num(flags.depth, 2, "depth"),
    maxPages: Math.max(1, num(flags["max-pages"], 20, "max-pages")),
    delayMs: num(flags.delay, 300, "delay"),
    out,
    ignoreRobots: !!flags["ignore-robots"],
  });
  const errors = doc.pages.filter((p) => p.error).length;
  console.log(`explore: ${doc.pages.length} pages (${errors} with errors), ${doc.pages.reduce((a, p) => a + p.controls.length, 0)} controls, ${doc.skipped.length} links not followed`);
  console.log(`  ${path.join(out, "tour-map.json")}\n  ${path.join(out, "tour-map.md")}\n  ${path.join(out, "scenes.draft.json")}\n  ${path.join(out, "thumbs")}/`);
  process.exit(doc.pages.length && errors < doc.pages.length ? 0 : 1);
}
