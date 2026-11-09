// Adapter for the Brightpost web app (a fictional marketing-post studio for independent
// shops: Next.js web + a core API server). Everything the recorder needs to know about this app
// lives here; the generic helpers come from recorder/takes/lib.mjs.
//
// Adapter hooks used by recorder/takes/run.mjs: init, setupSession, forbiddenKeys, parkPoint.
// (prepareTake and reload are left to the runner's defaults: guardKeys(forbiddenKeys) and
// "open baseUrl + / and wait 2.5 s".)
//
// Rules these helpers enforce (proven on the running app, 2026-11-06):
// - Send with the pointer, never Enter: a keydown switches the app to keyboard mode
//   (html[data-ui-input="keyboard"]), which turns entrance animations off until the next pointer
//   press. Typing uses Input.insertText (no key events), so the app stays in pointer mode.
// - Never press Escape during a turn (it stops generation).
// - Turn end is detected from the network (POST /api/chat, including the automatic resend after
//   client tool calls) and the DOM structure, never from translated labels.
import fs from "node:fs";
import path from "node:path";
import {
  guardKeys as guardKeysGeneric,
  markIf,
  park,
  requestIs,
  scrollToEnd,
  typeAndSend,
  uploadWithChooser,
  visibleFirst,
  waitForNetworkTurn,
} from "../../recorder/takes/lib.mjs";

// ------------------------------------------------------------------ settings (set by init)

/** App origin, e.g. http://localhost:3011 (config.baseUrl). Live binding: valid after init(). */
export let APP = "http://localhost:3011";
/** Studio instance folder (config.project.studioRoot). */
export let STUDIO = null;
/** File holding the one-time sign-in link for the demo shop owner (never committed). */
export let LINK_FILE = null;
/** Logo uploaded in take 1. */
export let LOGO_FILE = null;

export function init(config) {
  APP = config.baseUrl;
  STUDIO = config.project.studioRoot ?? null;
  LINK_FILE = config.project.linkFile ?? null;
  LOGO_FILE = config.project.logoFile ?? null;
}

/** Clipboard access for the copy buttons in the export sheet (take 9 reads it back). */
export async function setupSession(session) {
  await session.context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: APP }).catch(() => {});
}

export const forbiddenKeys = ["Enter", "Escape"];
export const guardKeys = (take) => guardKeysGeneric(take, forbiddenKeys);

/**
 * A resting place for the mouse that triggers no hover state: the preview pane's left gutter in the
 * studio (left of the post mock-up), otherwise empty page margin. Never a creative, tile or chip.
 */
export async function parkPoint(page) {
  const loc = page.locator('[data-pane="preview"]').first();
  const pane = (await loc.count()) ? await loc.boundingBox({ timeout: 1000 }).catch(() => null) : null;
  if (pane && pane.width > 200) return { x: pane.x + 30, y: Math.min(pane.y + pane.height * 0.62, 760) };
  if (page.url().includes("/company")) return { x: 1270, y: 420 };
  return { x: 1180, y: 640 };
}

// ------------------------------------------------------------------ selectors (structure, not text)

export const SEL = Object.freeze({
  /** The composer's textarea: #composer-hero on the start screen, #composer-dock in the studio. */
  composer: 'textarea[id^="composer-"]',
  /** Send (type=submit) only exists while no turn is running; during a turn it is the Stop button. */
  send: 'form:has(textarea[id^="composer-"]) button[type="submit"]',
  stop: 'form:has(textarea[id^="composer-"]) div:has(> textarea) > button[type="button"]',
  /** A question the agent asked, shown in place of the composer. */
  questionPanel: '[role="group"][aria-labelledby="qp-title"]',
  /** A short single-choice question answered inline in the conversation. */
  inlineChoices: '[data-pane="chat"] [role="group"]:not([aria-labelledby]):has(> button)',
  /** Suggested follow-up chips after a successful reply with an open campaign. */
  followUps: '[data-pane="chat"] ul.edge-fade-x',
  /** Tray status line: error (red) or stopped / daily limit. */
  errorStrip: '[role="status"].text-error-primary',
  status: '[role="status"]',
  preview: '[data-pane="preview"]',
  chatPane: '[data-pane="chat"]',
  fileInput: 'input[type="file"]',
});

/** Chip rows and tab rows with faded edges scroll when the mouse rests within 56 px of the edge. */
export const REST_GUARD = Object.freeze({ selector: ".edge-fade-x", zone: 56, margin: 8 });

export const chat = (page) => page.locator(SEL.chatPane);
export const preview = (page) => page.locator(SEL.preview);

const visible = (page, sel) =>
  page
    .locator(sel)
    .first()
    .isVisible()
    .catch(() => false);

/** Read the turn's visible result from DOM structure only (locale-independent). */
export async function classifyTurn(page) {
  if (await visible(page, SEL.questionPanel)) return "question";
  if (await visible(page, SEL.inlineChoices)) return "inline-question";
  if (await visible(page, SEL.errorStrip)) return "error";
  if (await visible(page, SEL.followUps)) return "success";
  if (await visible(page, SEL.status)) return "stopped-or-limit";
  return "reply";
}

// ------------------------------------------------------------------ chat turns

/**
 * Click the composer, type `text` with the natural cadence, then click Send with the pointer.
 * Returns a NetworkWatcher on POST /api/chat that was listening before the click (pass it to
 * waitForTurn). Labels: "<label> field", "<label> text", "<label> send".
 */
export async function sendChat(take, text, { label, cps = 14, seed = 1 } = {}) {
  const page = take.page;
  return typeAndSend(take, {
    field: visibleFirst(page.locator(SEL.composer)),
    send: visibleFirst(page.locator(SEL.send)),
    text,
    label,
    cps,
    seed,
    match: requestIs("POST", "/api/chat"),
  });
}

/**
 * Wait for an agent turn to end and classify it. The turn has ended when no POST /api/chat is in
 * flight and either Send is back or a question panel is shown, both held for `settleMs`.
 * Outcomes: success | question | inline-question | error | stopped-or-limit | reply | not-sent | timeout.
 * Logged as waitStart/waitEnd "<label>"; waitEnd carries requests, statuses, seconds and uiInput.
 */
export function waitForTurn(take, watcher, { label, timeout = 6 * 60_000, settleMs = 1000, startTimeout = 15_000 } = {}) {
  const page = take.page;
  return waitForNetworkTurn(take, watcher, {
    label,
    timeout,
    settleMs,
    startTimeout,
    calm: async () => (await visible(page, SEL.send)) || (await visible(page, SEL.questionPanel)),
    classify: () => classifyTurn(page),
    detail: async () => ({ uiInput: await page.evaluate(() => document.documentElement.dataset.uiInput ?? null) }),
  });
}

/** The in-chat status line while the agent works (role=status, shimmer). */
export const statusLine = (page) => chat(page).locator('p[role="status"]').last();
/** The "Worked for N s" / "Thought for N s" line of the latest reply. */
export const workedLine = (page) => chat(page).locator("details > summary").last();

/** Scroll the chat to its end with the wheel (logged). */
export const chatToEnd = (take, label) => scrollToEnd(take, chat(take.page), label);

/**
 * Run an agent-turn wait and, while it runs, mark the status line each time its text changes
 * (labels `${prefix} status 1..n`, with the text), mark each new shimmer loader box once
 * (`${prefix} loader N`, kind "poster sheen" or "skeleton"), and once the status line shows,
 * scroll the chat to its end and park the mouse.
 */
export async function watchTurn(take, waitPromise, { prefix, scrollLabel } = {}) {
  const page = take.page;
  let done = false;
  let n = 0;
  let last = "";
  let scrolled = false;
  const loaderBoxes = new Set();
  let nLoader = 0;
  const side = (async () => {
    while (!done) {
      try {
        const boxes = await page.evaluate(() =>
          [...document.querySelectorAll(".agent-working, .skeleton")]
            .map((el) => {
              const r = el.getBoundingClientRect();
              return { kind: el.classList.contains("skeleton") ? "skeleton" : "poster sheen", x: r.x, y: r.y, width: r.width, height: r.height };
            })
            .filter((b) => b.width > 8 && b.height > 8 && b.y < innerHeight && b.y + b.height > 0),
        );
        for (const b of boxes) {
          const key = `${b.kind}|${Math.round(b.x / 8)}|${Math.round(b.y / 8)}|${Math.round(b.width / 8)}|${Math.round(b.height / 8)}`;
          if (loaderBoxes.has(key)) continue;
          loaderBoxes.add(key);
          nLoader++;
          await take.mark(`${prefix} loader ${nLoader}`, { x: b.x, y: b.y, width: b.width, height: b.height }, { kind: b.kind });
        }
        const st = statusLine(page);
        if (await st.isVisible().catch(() => false)) {
          const text = (await st.innerText()).trim();
          if (text && text !== last) {
            last = text;
            n++;
            await markIf(take, `${prefix} status ${n}`, st, { text });
          }
          if (!scrolled && scrollLabel) {
            scrolled = true;
            await chatToEnd(take, scrollLabel).catch((e) => take.warn(`chatToEnd: ${e.message}`));
            await park(take, `${scrollLabel} park`).catch(() => {});
          }
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
  try {
    return await waitPromise;
  } finally {
    done = true;
    await side;
  }
}

// ------------------------------------------------------------------ uploads and cards

/**
 * Upload the logo by clicking the drop zone ("Upload your logo…", which opens a hidden file input)
 * with the pointer; the file chooser is intercepted. Waits for POST /api/company/logo and for the
 * uploaded previews (`uploaded`) to show. Logged: click "<label>", wait "<label> upload".
 */
export async function uploadLogo(take, filePath, { label, target = null, timeout = 30_000, uploaded = "main figure" } = {}) {
  const page = take.page;
  const zone = target ?? page.getByRole("button", { name: /^Upload your logo/ });
  const r = await uploadWithChooser(take, zone, filePath, {
    label,
    timeout,
    shown: uploaded,
    response: (resp) => requestIs("POST", "/api/company/logo")(resp.request()),
  });
  return { outcome: r.outcome, logoId: r.body?.id ?? null, status: r.status, findings: r.body?.findings ?? [] };
}

/**
 * A button inside option card N of the chat gallery ("Preview" / "Modify"), found by structure:
 * the nearest ancestor of the button that holds a "Preview option N:" image button.
 */
export async function optionCardButton(page, n, name) {
  const buttons = page.locator('[data-pane="chat"] button').filter({ hasText: name });
  const idx = await buttons.evaluateAll((els, n2) => {
    let found = -1;
    els.forEach((b, i) => {
      let a = b.parentElement;
      while (a && !a.querySelector('button[aria-label^="Preview option "]')) a = a.parentElement;
      const img = a?.querySelector('button[aria-label^="Preview option "]');
      if (img && new RegExp(`^Preview option ${n2}\\b`).test(img.getAttribute("aria-label"))) found = i;
    });
    return found;
  }, n);
  if (idx < 0) throw new Error(`no "${name}" button on option card ${n}`);
  return buttons.nth(idx);
}

/** Box of option card N in the chat gallery (the card container around its image and buttons). */
export async function cardBox(page, n) {
  return chat(page)
    .locator(`button[aria-label^="Preview option ${n}:"]`)
    .last()
    .evaluate((img) => {
      let a = img.parentElement;
      while (a && !(a.querySelector('button[aria-label^="Preview option "]') && [...a.querySelectorAll("button")].some((b) => /Modify/.test(b.textContent)))) a = a.parentElement;
      const r = (a ?? img).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
}

// ------------------------------------------------------------------ app state (truth checks, off camera)

/** Campaign snapshots from the shop owner's data export (latest snapshot per campaign id). */
export async function campaigns(page) {
  const j = await (await page.request.get(`${APP}/api/me/export`)).json();
  const out = new Map();
  for (const m of j.chat) for (const p of m.parts) if (p.type === "data-campaign" && p.data?.id) out.set(p.data.id, p.data);
  return { list: [...out.values()], notes: j.notes };
}

/** Platforms that have creatives on an option (from its creatives map). */
export function platformsOf(option) {
  const c = option.creatives ?? {};
  const keys = Array.isArray(c) ? c.map((x) => x.platform).filter(Boolean) : Object.keys(c);
  return [...new Set(keys)];
}

/** Download an option's kit zip with the browser's cookies. */
export async function downloadKit(page, cid, oid, platforms, file) {
  const r = await page.request.get(`${APP}/api/campaigns/${cid}/options/${oid}/kit?platforms=${platforms.join(",")}`);
  if (!r.ok()) throw new Error(`kit ${cid}/${oid}: ${r.status()}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, await r.body());
  return file;
}

// ------------------------------------------------------------------ story text

/** The prompts typed in the takes (English UI; the language scene clicks data-key options only). */
export const SENTENCES = {
  campaign: "First frost is forecast this weekend. Winter commuting posts for the Ridgeline 7.",
  redesign: "Try a new design: photo on top, text in a teal block underneath.",
  german:
    "Translate this option into German: headline, button, post text and hashtags, including the text on the image. Keep the design.",
  rule: "From now on, always end our posts with 'Free safety check for every customer.' And we're closed on Sundays.",
  second: "Now an all-season post for the Coastline 3.",
  postEdit: " Book your tune-up before Saturday.",
  headline: "Frost lands this weekend",
};
