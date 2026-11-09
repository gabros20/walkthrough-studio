// The nine takes of the Brightpost walkthrough, in story order, as recorded on 2026-11-06.
// Loaded by recorder/takes/run.mjs through walkthrough.config.mjs (export SCENES).
// Each: { n, name, checkpoint, pre(session, ctx), run(take, ctx), truth(session, ctx, take) }.
// Pacing: >= 0.5 s still before an action, >= 1.2 s after a visible result, 2 s on the big
// reveals, about 0.6 s per chip in the format tour.
// Hover hygiene: whenever the pointer rests longer than about half a second it is parked where it
// triggers no hover state (labels "<action> park"); the only time it rests on a creative is the
// on-image headline edit. Label names are kept identical to the previous pass for the same action.
import fs from "node:fs";
import path from "node:path";
import { beat, caretAfter, clickPark, markEach, markIf, park, textBox, visibleFirst } from "../../recorder/takes/lib.mjs";
import {
  APP,
  campaigns,
  cardBox,
  chat,
  chatToEnd,
  downloadKit,
  LINK_FILE,
  LOGO_FILE,
  optionCardButton,
  platformsOf,
  preview,
  SENTENCES,
  sendChat,
  uploadLogo,
  waitForTurn,
  watchTurn,
  workedLine,
} from "./app.mjs";

const optionTab = (page, n) => visibleFirst(preview(page).locator(`[role="radio"][aria-label^="Option ${n}:"]`));
const platformTab = (page, name) => preview(page).locator('[role="radio"]').filter({ hasText: new RegExp(`^${name}$`) }).first();
const formatRow = (page) => visibleFirst(preview(page).locator('[role="radiogroup"].edge-fade-x'));
const previewImg = (page) => visibleFirst(preview(page).locator('img[alt*="preview of option"]'));
const postText = (page) => visibleFirst(preview(page).locator('[role="textbox"][aria-label^="Post text"], [role="textbox"][aria-label^="Email text"]'));
const savedBadge = (page) => visibleFirst(preview(page).locator('[role="status"].bg-success-primary'));
const langButton = (page) => page.locator("header button").filter({ has: page.locator("img") }).first();
const headlineHotspot = (page) => preview(page).getByRole("button", { name: "Edit the headline on the image" }).first();
const ctaHotspot = (page) => preview(page).getByRole("button", { name: "Edit the call to action on the image" }).first();

const re = (label) => ({ "colour brightpost teal": /Brightpost teal/, "button pill": /Pill/, "our logo first": /Our logo first/, "with a divider": /With a divider/ })[label];

/** Bring the creative image into view in the preview pane, then park. */
async function showCreative(take, label) {
  const r = await take.reveal(previewImg(take.page), { label, align: 0.5 });
  if (r) await park(take, `${label} park`);
  return r;
}

async function markPreview(take, prefix) {
  const page = take.page;
  await markIf(take, `${prefix} preview pane`, preview(page));
  await markIf(take, `${prefix} preview image`, previewImg(page));
}

async function markOptionsReveal(take, prefix) {
  const page = take.page;
  for (const n of [1, 2, 3]) {
    const box = await cardBox(page, n).catch(() => null);
    if (box) await take.mark(`${prefix} option card ${n}`, box);
  }
  await markIf(take, `${prefix} worked for`, workedLine(page), { text: await workedLine(page).innerText().catch(() => "") });
  await markIf(take, `${prefix} chat pane`, chat(page));
  await markPreview(take, prefix);
  await markEach(take, `${prefix} option tab`, preview(page).locator('[role="radio"][aria-label^="Option "]').filter({ visible: true }), (i) => String(i + 1));
  await markIf(take, `${prefix} format row`, formatRow(page));
  await markEach(take, `${prefix} format chip`, formatRow(page).locator('[role="radio"]'), (i, t) => t.replace(/\d+×\d+$/, "").trim());
  await markIf(take, `${prefix} export button`, preview(page).getByRole("button", { name: "Export" }));
  await markIf(take, `${prefix} add platform`, preview(page).getByRole("button", { name: "Add a platform" }));
  await markIf(take, `${prefix} composer`, page.locator('form:has(textarea[id^="composer-"])'));
}

async function zipText(file, entry) {
  const { execFileSync } = await import("node:child_process");
  return execFileSync("unzip", ["-p", file, entry], { encoding: "utf8" });
}

async function zipList(file) {
  const { execFileSync } = await import("node:child_process");
  return execFileSync("unzip", ["-Z1", file], { encoding: "utf8" }).split("\n").filter((l) => l && !l.endsWith("/"));
}

/** Option number the agent recommends in its last reply ("I'd pick option 2", or by title). */
async function agentPick(page, titles) {
  const text = await chat(page).locator("ol > li").last().innerText().catch(() => "");
  const m = text.match(/(?:pick|recommend|go with|choose)[^.]*?option\s*(\d)/i);
  if (m) return { n: Number(m[1]), why: `agent recommends option ${m[1]}` };
  for (const [i, t] of titles.entries()) if (t && new RegExp(`(?:pick|recommend|go with)[^.]*${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text)) return { n: i + 1, why: `agent recommends "${t}"` };
  return null;
}

export const SCENES = [
  // ---------------------------------------------------------------- 1. sign-in, logo, start screen
  {
    n: 1,
    name: "take-1-signin",
    checkpoint: "CP1",
    async pre(session) {
      if (!LINK_FILE || !fs.existsSync(LINK_FILE)) throw new Error("take 1 needs a fresh one-time sign-in link in config.project.linkFile");
      const link = fs.readFileSync(LINK_FILE, "utf8").trim();
      await session.offCamera(async (page) => {
        await page.goto(link);
        await page.getByRole("button", { name: "Continue" }).waitFor();
        await page.waitForTimeout(1500);
      });
      session.pointer = { x: 1080, y: 850 };
      await session.page.mouse.move(1080, 850);
    },
    async run(take) {
      const page = take.page;
      await beat(take, 1.5);
      await markIf(take, "confirm heading", page.getByRole("heading", { level: 1 }));
      await markIf(take, "company and name", page.locator("main dl").first());
      await markIf(take, "company name", page.locator("main dd").nth(0));
      await markIf(take, "user name", page.locator("main dd").nth(1));
      await beat(take, 0.6);
      await take.click(page.getByRole("button", { name: "Continue" }), { label: "continue" });
      await take.wait("logo step", async () => {
        await page.getByRole("button", { name: /^Upload your logo/ }).waitFor();
        return "shown";
      });
      await park(take, "continue park");
      await beat(take, 1.3);
      await markIf(take, "logo heading", page.getByRole("heading", { name: "Company logo" }));
      await markIf(take, "drop zone", page.getByRole("button", { name: /^Upload your logo/ }));
      await beat(take, 0.4);
      const up = await uploadLogo(take, LOGO_FILE, { label: "choose logo" });
      if (up.outcome !== "success") throw new Error(`logo upload: ${JSON.stringify(up)}`);
      await park(take, "choose logo park");
      await beat(take, 0.6);
      await markIf(take, "logo on dark", page.locator("main figure").nth(0));
      await markIf(take, "logo on light", page.locator("main figure").nth(1));
      await markIf(take, "logo previews", page.locator("main figure").nth(0).locator(".."));
      await markIf(take, "uploaded state", page.locator("main figure").nth(0).locator("../.."));
      await markIf(take, "logo saved note", page.getByText("Logo saved."));
      await beat(take, 1.6);
      await markIf(take, "first post button", page.getByRole("button", { name: "Create your first post" }));
      await take.click(page.getByRole("button", { name: "Create your first post" }), { label: "first post" });
      await take.wait("start screen", async () => {
        await page.locator("#composer-hero").waitFor();
        await page.waitForLoadState("networkidle").catch(() => {});
        return "shown";
      });
      await park(take, "first post park");
      await beat(take, 2.0);
      await markIf(take, "greeting", page.getByRole("heading", { level: 1 }));
      await markIf(take, "hero composer", page.locator("form:has(#composer-hero)"));
      await markIf(take, "platform picker", page.locator('button[aria-label^="Platform:"]'));
      await markIf(take, "suggestions", page.locator("main ul").last());
      await beat(take, 1.0);
    },
    async truth(session) {
      return session.offCamera(async (page) => {
        const r = await page.request.get(`${APP}/api/company/logo`);
        return { url: page.url(), heroComposer: await page.locator("#composer-hero").isVisible(), logoGet: r.status(), logoType: r.headers()["content-type"] };
      });
    },
  },

  // ---------------------------------------------------------------- 2. the one sentence
  {
    n: 2,
    name: "take-2-campaign",
    checkpoint: "CP2",
    async run(take, ctx) {
      const page = take.page;
      await beat(take, 1.2);
      await markIf(take, "hero composer", page.locator("form:has(#composer-hero)"));
      await markIf(take, "platform picker", page.locator('button[aria-label^="Platform:"]'));
      await take.click(page.locator('button[aria-label^="Platform:"]'), { label: "platform picker" });
      await page.locator('[role="menu"]').waitFor();
      await beat(take, 1.2);
      await markIf(take, "platform menu", page.locator('[role="menu"]'));
      for (const item of await page.locator('[role="menu"] [role^="menuitem"]').all())
        await markIf(take, `platform item ${await item.getAttribute("data-key")}`, item);
      await take.moveTo(page.locator('[role="menu"] [role^="menuitem"]').last(), { label: "browse platforms", at: { x: 0.35, y: 0.5 } });
      await beat(take, 0.5);
      await take.click(page.locator('[role="menu"] [role^="menuitem"]').filter({ hasText: "Instagram" }).first(), { label: "keep instagram" });
      await beat(take, 0.7);
      const watcher = await sendChat(take, SENTENCES.campaign, { label: "campaign" });
      await park(take, "campaign send park");
      const res = await watchTurn(take, waitForTurn(take, watcher, { label: "campaign reply" }), { prefix: "campaign" });
      ctx.turns = (ctx.turns ?? 0) + 1;
      ctx.results.campaign = res;
      if (res.outcome !== "success") throw new Error(`campaign turn: ${res.outcome}`);
      await chatToEnd(take, "chat to reply").catch(() => {});
      await park(take, "chat to reply park");
      await beat(take, 2.0);
      await markOptionsReveal(take, "reveal");
      await beat(take, 1.0);
    },
    async truth(session, ctx, take) {
      return session.offCamera(async (page) => {
        const { list } = await campaigns(page);
        const c = list.at(-1);
        ctx.campaign1 = c.id;
        ctx.options1 = c.options.map((o) => o.id);
        const dir = path.join(take.dir, "kits");
        const out = { campaign: c.id, options: [] };
        for (const [i, o] of c.options.entries()) {
          const f = await downloadKit(page, c.id, o.id, ["instagram"], path.join(dir, `option-${i + 1}.zip`));
          out.options.push({ id: o.id, title: o.title, headline: o.headline, platforms: ["instagram"], kitFiles: await zipList(f) });
        }
        return out;
      });
    },
  },

  // ---------------------------------------------------------------- 3. choose, formats, edits
  {
    n: 3,
    name: "take-3-choose",
    checkpoint: "CP2b",
    async run(take, ctx) {
      const page = take.page;
      await beat(take, 1.0);
      for (const n of [2, 3, 1]) {
        await clickPark(take, optionTab(page, n), { label: `option ${n}` });
        await beat(take, 1.2);
        await markIf(take, `option ${n} image`, previewImg(page));
      }
      for (const [label, re] of [["format 4:5", /Feed post 4:5/], ["format 9:16", /Story/], ["format 1:1", /Feed post 1:1/]]) {
        await clickPark(take, formatRow(page).locator('[role="radio"]').filter({ hasText: re }).first(), { label });
        await beat(take, label === "format 9:16" ? 1.6 : 1.2);
        await markIf(take, `${label} image`, previewImg(page));
      }
      // Post text, inline.
      const text = postText(page);
      await take.reveal(text, { label: "to post text", align: 0.55 });
      await park(take, "to post text park");
      await beat(take, 0.8);
      await markIf(take, "post text", text);
      const before = await text.innerText();
      const firstStop = before.indexOf(". ");
      if (firstStop < 0) throw new Error("post text has no sentence break");
      const sentence = before.slice(0, firstStop + 1);
      const caret = await caretAfter(text, sentence.slice(-12));
      await take.click(caret, { label: "post text end of sentence" });
      await beat(take, 0.4);
      await take.type(SENTENCES.postEdit, { label: "post text edit" });
      await take.wait("post text saved", async () => {
        await savedBadge(page).waitFor({ timeout: 10000 });
        return "saved";
      });
      await park(take, "post text edit park");
      await beat(take, 0.3);
      await markIf(take, "saved indicator", savedBadge(page));
      await markIf(take, "edited sentence", (await textBox(text, SENTENCES.postEdit.trim())) ?? text);
      await beat(take, 1.2);
      // Headline on the image (the one moment the pointer rests on a creative).
      await take.reveal(previewImg(page), { label: "to image", align: 0.5 });
      await beat(take, 0.4);
      const hot = headlineHotspot(page);
      await take.moveTo(hot, { label: "hover image", at: { x: 0.5, y: 0.5 } });
      await beat(take, 0.9);
      await markIf(take, "headline on image", hot);
      await take.click(hot, { label: "edit headline" });
      const dialog = page.locator('[role="dialog"]').last();
      await dialog.waitFor();
      await beat(take, 0.8);
      await markIf(take, "headline popover", dialog);
      const imgSrc = await previewImg(page).getAttribute("src");
      await take.click(dialog.locator('[role="textbox"]'), { label: "select headline", count: 3, at: { x: 0.3, y: 0.5 } });
      await beat(take, 0.3);
      await take.type(SENTENCES.headline, { label: "headline text", cps: 16, seed: 3 });
      await take.wait("image update", async () => {
        await dialog.waitFor({ state: "detached", timeout: 15000 });
        for (let i = 0; i < 80; i++) {
          const src = await previewImg(page).getAttribute("src").catch(() => imgSrc);
          if (src && src !== imgSrc) return "rendered";
          await page.waitForTimeout(250);
        }
        return "unchanged";
      });
      await park(take, "rest off image");
      await beat(take, 2.0);
      await markIf(take, "edited headline on image", headlineHotspot(page));
      await markIf(take, "edited image", previewImg(page));
      await markIf(take, "saved indicator after image edit", savedBadge(page));
      await beat(take, 1.0);
    },
    async truth(session, ctx, take) {
      return session.offCamera(async (page) => {
        const { list } = await campaigns(page);
        const c = list.find((x) => x.id === ctx.campaign1);
        const o = c.options[0];
        const f = await downloadKit(page, c.id, o.id, ["instagram"], path.join(take.dir, "kits", "option-1-edited.zip"));
        const copy = await zipText(f, "copy.txt");
        return { kitFiles: await zipList(f), postEditInKit: copy.includes(SENTENCES.postEdit.trim()), copy, headlineCheck: "visual: kits/option-1-edited.zip and the master" };
      });
    },
  },

  // ---------------------------------------------------------------- 4. refine: redesign option 1
  {
    n: 4,
    name: "take-4-redesign",
    checkpoint: "CP3",
    async run(take, ctx) {
      const page = take.page;
      await beat(take, 1.0);
      // Judge the redesign on the 4:5 feed post: visible when the prompt is sent and when it lands.
      const fourFive = formatRow(page).locator('[role="radio"]').filter({ hasText: /Feed post 4:5/ }).first();
      if ((await fourFive.getAttribute("aria-checked")) !== "true") {
        await clickPark(take, fourFive, { label: "format 4:5" });
        await beat(take, 1.4);
      }
      await markIf(take, "before redesign image", previewImg(page));
      const mod = await optionCardButton(page, 1, "Modify");
      await take.reveal(mod, { label: "chat to option 1", align: 0.4 });
      await beat(take, 0.6);
      await take.mark("option card 1", await cardBox(page, 1));
      await markIf(take, "modify button", mod);
      await clickPark(take, mod, { label: "modify option 1" });
      await beat(take, 0.8);
      await markIf(take, "composer target chip", page.locator("form:has(#composer-dock) span").first());
      const watcher = await sendChat(take, ctx.redesignPrompt ?? SENTENCES.redesign, { label: "redesign" });
      await park(take, "redesign send park");
      const res = await watchTurn(take, waitForTurn(take, watcher, { label: "redesign reply" }), { prefix: "redesign", scrollLabel: "chat to latest" });
      ctx.turns = (ctx.turns ?? 0) + 1;
      ctx.results.redesign = res;
      if (res.outcome !== "success") throw new Error(`redesign turn: ${res.outcome}`);
      await chatToEnd(take, "chat to reply").catch(() => {});
      await park(take, "chat to reply park");
      if ((await fourFive.getAttribute("aria-checked").catch(() => "true")) !== "true") {
        await clickPark(take, fourFive, { label: "format 4:5 again" });
        await beat(take, 1.0);
      }
      await beat(take, 2.0);
      await markIf(take, "worked for", workedLine(page), { text: await workedLine(page).innerText().catch(() => "") });
      await markPreview(take, "redesign");
      await markIf(take, "suggested changes", chat(page).locator("ul.edge-fade-x").last());
      const chips = chat(page).locator("ul.edge-fade-x").last().locator("button");
      await markEach(take, "suggested chip", chips);
      // The pointer passes over the suggested-change chips without resting on them.
      const n = Math.min(3, await chips.count());
      for (let i = 0; i < n; i++) {
        await take.moveTo(chips.nth(i), { label: `hover chip ${i + 1}` });
        await beat(take, 0.25);
      }
      await park(take, "rest");
      await beat(take, 1.2);
    },
    async truth(session, ctx, take) {
      return session.offCamera(async (page) => {
        const { list } = await campaigns(page);
        const c = list.find((x) => x.id === ctx.campaign1);
        const o = c.options[0];
        const f = await downloadKit(page, c.id, o.id, ["instagram"], path.join(take.dir, "kits", "option-1-redesigned.zip"));
        return { designAfter: o.design, kitFiles: await zipList(f) };
      });
    },
  },

  // ---------------------------------------------------------------- 5. expand + translate
  {
    n: 5,
    name: "take-5-platforms-german",
    checkpoint: "CP4",
    async run(take, ctx) {
      const page = take.page;
      await beat(take, 1.0);
      const pv = preview(page);
      const order = ["LinkedIn", "Facebook", "TikTok", "Display ads", "Newsletter"];
      for (const [i, name] of order.entries()) {
        await take.click(pv.getByRole("button", { name: "Add a platform" }), { label: `add platform ${i + 1}` });
        await page.locator('[role="menu"]').waitFor();
        await beat(take, 0.6);
        if (i === 0) {
          await markIf(take, "add platform menu", page.locator('[role="menu"]'));
          for (const item of await page.locator('[role="menu"] [role^="menuitem"]').all())
            await markIf(take, `add platform item ${await item.getAttribute("data-key")}`, item);
        }
        await take.click(page.locator('[role="menu"] [role^="menuitem"]').filter({ hasText: name }).first(), { label: `add ${name}` });
        await take.wait(`${name} ready`, async () => {
          await platformTab(page, name).waitFor();
          for (let k = 0; k < 120; k++) {
            if (!(await pv.locator(".skeleton").count())) return "rendered";
            await page.waitForTimeout(250);
          }
          return "slow";
        });
        await park(take, `add ${name} park`);
        await beat(take, 1.0);
      }
      await markIf(take, "platform tabs", visibleFirst(pv.locator(".edge-fade-x").filter({ has: page.locator('[role="radio"]') })));
      await markEach(take, "platform tab", pv.locator('[role="radio"]').filter({ hasText: /^(Instagram|Facebook|TikTok|LinkedIn|Display ads|Newsletter)$/ }));
      // Format tour: every format of every platform, with the creative itself in view.
      for (const name of ["Instagram", "Facebook", "TikTok", "LinkedIn", "Display ads", "Newsletter"]) {
        await take.click(platformTab(page, name), { label: `tour ${name}`, lead: 0.12 });
        await markIf(take, `tour ${name} format row`, formatRow(page));
        const chips = formatRow(page).locator('[role="radio"]');
        const n = await chips.count();
        for (let i = 0; i < n; i++) {
          const chip = chips.nth(i);
          if (i > 0 || (await chip.getAttribute("aria-checked")) !== "true") await take.click(chip, { label: `tour ${name} format ${i + 1}`, lead: 0.12 });
          await take.wait(`tour ${name} format ${i + 1} loaded`, async () => {
            for (let k = 0; k < 120; k++) {
              const ok = await previewImg(page).evaluate((im) => im.complete && im.naturalWidth > 0).catch(() => false);
              if (ok && !(await pv.locator(".skeleton").count())) return "loaded";
              await page.waitForTimeout(100);
            }
            return "timeout";
          });
          await showCreative(take, `tour ${name} to ad ${i + 1}`);
          await park(take, `tour ${name} format ${i + 1} park`);
          await beat(take, 0.6);
          await markIf(take, `tour ${name} image ${i + 1}`, previewImg(page));
        }
      }
      await beat(take, 0.8);
      // UI languages (Magyar is scrolled into view inside the list before it is clicked).
      for (const [key, name] of [["de", "Deutsch"], ["fr", "Français"], ["hu", "Magyar"], ["en", "English"]]) {
        await take.click(langButton(page), { label: `language menu ${key}` });
        await page.locator('[role="listbox"], [role="option"]').first().waitFor();
        await beat(take, 0.6);
        if (key === "de") {
          await markIf(take, "language list", page.locator('[role="listbox"]').first());
          await markEach(take, "language", page.locator('[role="option"]'), (i, t) => t);
        }
        const opt = page.locator(`[role="option"][data-key="${key}"]`);
        await take.reveal(opt, { label: `reveal ${name}`, align: 0.6, margin: 4 });
        await take.click(opt, { label: `language ${name}` });
        await take.wait(`ui in ${key}`, async () => {
          for (let k = 0; k < 40; k++) {
            if ((await langButton(page).innerText().catch(() => "")).includes(name)) {
              await page.waitForLoadState("networkidle").catch(() => {});
              return "relabelled";
            }
            await page.waitForTimeout(200);
          }
          return "unconfirmed";
        });
        await park(take, `language ${name} park`);
        await beat(take, key === "en" ? 1.2 : 1.5);
        await markIf(take, `${key} language button`, langButton(page));
      }
      // German turn on option 2.
      const mod = await optionCardButton(page, 2, "Modify");
      await take.reveal(mod, { label: "chat to option 2", align: 0.4 });
      await beat(take, 0.6);
      await take.mark("option card 2", await cardBox(page, 2));
      await clickPark(take, mod, { label: "modify option 2" });
      await beat(take, 0.8);
      await markIf(take, "composer target chip", page.locator("form:has(#composer-dock) span").first());
      const watcher = await sendChat(take, SENTENCES.german, { label: "german" });
      await park(take, "german send park");
      const res = await watchTurn(take, waitForTurn(take, watcher, { label: "german reply" }), { prefix: "german", scrollLabel: "chat to latest" });
      ctx.turns = (ctx.turns ?? 0) + 1;
      ctx.results.german = res;
      if (res.outcome !== "success") throw new Error(`german turn: ${res.outcome}`);
      await chatToEnd(take, "chat to reply").catch(() => {});
      await park(take, "chat to reply park");
      await beat(take, 2.0);
      await markIf(take, "worked for", workedLine(page), { text: await workedLine(page).innerText().catch(() => "") });
      await markPreview(take, "german");
      await markIf(take, "german headline on image", headlineHotspot(page));
      for (const name of ["Instagram", "Newsletter"]) {
        await clickPark(take, platformTab(page, name), { label: `german ${name}` });
        await showCreative(take, `german ${name} to image`);
        await beat(take, 1.6);
        await markIf(take, `german ${name} image`, previewImg(page));
        await markIf(take, `german ${name} text`, postText(page));
      }
      await beat(take, 0.8);
    },
    async truth(session, ctx, take) {
      return session.offCamera(async (page) => {
        const { list } = await campaigns(page);
        const c = list.find((x) => x.id === ctx.campaign1);
        const o = c.options[1];
        const plats = ["instagram", "facebook", "tiktok", "linkedin", "display_ads", "newsletter"];
        const f = await downloadKit(page, c.id, o.id, plats, path.join(take.dir, "kits", "option-2-german.zip"));
        return { headline: o.headline, cta: o.cta, hashtags: o.hashtags, platforms: plats, kitFiles: await zipList(f), copy: await zipText(f, "copy.txt") };
      });
    },
  },

  // ---------------------------------------------------------------- 6. teach a rule
  {
    n: 6,
    name: "take-6-rule",
    checkpoint: "CP5",
    async run(take, ctx) {
      const page = take.page;
      await beat(take, 1.0);
      const watcher = await sendChat(take, SENTENCES.rule, { label: "rule" });
      await park(take, "rule send park");
      const res = await watchTurn(take, waitForTurn(take, watcher, { label: "rule reply" }), { prefix: "rule", scrollLabel: "chat to latest" });
      ctx.turns = (ctx.turns ?? 0) + 1;
      ctx.results.rule = res;
      if (res.outcome !== "success" && res.outcome !== "reply") throw new Error(`rule turn: ${res.outcome}`);
      await chatToEnd(take, "chat to reply").catch(() => {});
      await park(take, "chat to reply park");
      await beat(take, 2.0);
      await markIf(take, "worked for", workedLine(page), { text: await workedLine(page).innerText().catch(() => "") });
      await markIf(take, "rule reply", chat(page).locator("ol > li").last());
      await markIf(take, "chat pane", chat(page));
      await beat(take, 1.0);
    },
    async truth(session) {
      return session.offCamera(async (page) => {
        const m = await (await page.request.get(`${APP}/api/memory`)).json();
        return { notes: m.records.map((r) => ({ kind: r.kind, text: r.text, createdAt: r.createdAt })), ok: m.records.length >= 1 };
      });
    },
  },

  // ---------------------------------------------------------------- 7. company profile
  {
    n: 7,
    name: "take-7-settings",
    checkpoint: "CP6",
    async run(take) {
      const page = take.page;
      await beat(take, 1.0);
      await take.click(page.getByRole("button", { name: /^Account menu/ }), { label: "account menu" });
      await page.locator('[role="menu"]').waitFor();
      await beat(take, 0.8);
      await markIf(take, "account menu", page.locator('[role="menu"]'));
      await take.click(page.locator('[role="menu"] [role^="menuitem"]').filter({ hasText: "Settings" }), { label: "settings" });
      await take.wait("settings page", async () => {
        await page.getByRole("heading", { name: "Brand kit" }).waitFor();
        await page.waitForLoadState("networkidle").catch(() => {});
        return "shown";
      });
      await park(take, "settings park");
      await beat(take, 1.6);
      await markIf(take, "settings heading", page.getByRole("heading", { level: 1 }));
      await markIf(take, "back to app button", page.getByRole("link", { name: "Back to the app" }).first());
      await markIf(take, "profile section", page.getByRole("heading", { name: "Your profile" }));
      await markIf(take, "company section", page.getByRole("heading", { name: "Company" }));
      await markIf(take, "company name field", page.locator("main input").nth(1));
      await markIf(take, "logo on dark", page.locator("main figure").nth(0));
      await markIf(take, "logo on light", page.locator("main figure").nth(1));
      await beat(take, 0.6);
      // Brand kit: before each click, the clicked control's whole row (label included) and the whole
      // preview card must sit inside the viewport with >= 24 px margin above the row and below the
      // card. Scroll positions are computed from the page; a scroll only happens between clicks.
      const kitImg = page.getByRole("img", { name: "Your latest post with these settings" });
      const MARGIN = 24;
      const VH = take.session.height;
      const union = (bs) => {
        const v = bs.filter(Boolean);
        const x0 = Math.min(...v.map((b) => b.x));
        const y0 = Math.min(...v.map((b) => b.y));
        const x1 = Math.max(...v.map((b) => b.x + b.width));
        const y1 = Math.max(...v.map((b) => b.y + b.height));
        return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
      };
      const rowBox = async (labelText, groups) =>
        union([
          await page.getByText(labelText, { exact: true }).first().boundingBox(),
          ...(await Promise.all(groups.map((g) => page.getByRole("radiogroup", { name: g }).boundingBox()))),
        ]);
      const frameFor = async (labelText, groups, scrollLabel) => {
        const row = await rowBox(labelText, groups);
        const card = await kitImg.boundingBox();
        const need = card.y + card.height - row.y + 2 * MARGIN;
        const fits = need <= VH;
        const targetTop = fits ? MARGIN + Math.floor((VH - need) / 2) : MARGIN;
        const okNow = row.y >= MARGIN && card.y + card.height <= VH - MARGIN;
        const dy = Math.round(row.y - targetTop);
        if (!(fits && okNow) && Math.abs(dy) > 2) {
          await take.scroll({ dy, label: scrollLabel, at: { x: 1250, y: 400 } });
          await park(take, `${scrollLabel} park`);
          await beat(take, 0.6);
        }
        const r2 = await rowBox(labelText, groups);
        const c2 = await kitImg.boundingBox();
        return { rowTop: Math.round(r2.y), rowBottom: Math.round(r2.y + r2.height), cardTop: Math.round(c2.y), cardBottom: Math.round(c2.y + c2.height), bothFit: r2.y >= MARGIN - 1 && c2.y + c2.height <= VH - MARGIN + 1, row: r2 };
      };
      const frames = {};
      frames.colours = await frameFor("Colours", ["Colours"], "to brand kit");
      await beat(take, 0.6);
      await markIf(take, "brand kit heading", page.getByRole("heading", { name: "Brand kit" }));
      for (const g of ["Colours", "Button", "Logo order", "Divider"]) await markIf(take, `group ${g}`, page.getByRole("radiogroup", { name: g }));
      await markIf(take, "kit preview", kitImg);
      for (const [label, group, rowLabel, rowGroups, scrollLabel] of [
        ["colour brightpost teal", "Colours", "Colours", ["Colours"], null],
        ["button pill", "Button", "Button", ["Button"], "to button and preview"],
        ["our logo first", "Logo order", "Logos", ["Logo order", "Divider"], "to logos and preview"],
        ["with a divider", "Divider", "Logos", ["Logo order", "Divider"], "to logos and preview again"],
      ]) {
        const f = scrollLabel ? await frameFor(rowLabel, rowGroups, scrollLabel) : frames.colours;
        frames[label] = f;
        if (!f.bothFit) take.warn(`${label}: row and card do not both fit (row top ${f.rowTop}, card bottom ${f.cardBottom})`);
        const r = page.getByRole("radiogroup", { name: group }).getByRole("radio").filter({ hasText: re(label) }).first();
        await markIf(take, `control ${label}`, r);
        await take.mark(`row ${label}`, f.row, { rowTop: f.rowTop, cardBottom: f.cardBottom, bothFit: f.bothFit });
        await clickPark(take, r, { label });
        await take.wait(`${label} preview`, async () => {
          await page.waitForLoadState("networkidle").catch(() => {});
          return "rendered";
        });
        await beat(take, 1.2);
        await markIf(take, `control ${label} after`, r);
        await markIf(take, `kit preview after ${label}`, kitImg);
      }
      take.framing = frames;
      await take.reveal(page.getByRole("button", { name: "Save brand kit" }), { label: "to preview", align: 0.8 });
      await park(take, "to preview park");
      await beat(take, 1.2);
      await markIf(take, "save brand kit button", page.getByRole("button", { name: "Save brand kit" }));
      const put = page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes("/api/company/brand-kit"));
      await take.click(page.getByRole("button", { name: "Save brand kit" }), { label: "save brand kit" });
      await take.wait("brand kit saved", async () => ((await put).ok() ? "saved" : "failed"));
      await park(take, "save brand kit park");
      await beat(take, 1.4);
      await markIf(take, "after save", page.getByRole("button", { name: "Save brand kit" }));
      await take.reveal(page.getByRole("heading", { name: "Assistant memory" }), { label: "to memory", align: 0.18 });
      await park(take, "to memory park");
      await beat(take, 1.6);
      await markIf(take, "memory heading", page.getByRole("heading", { name: "Assistant memory" }));
      const del = page.getByRole("button", { name: "Delete note" });
      await markIf(take, "memory list", del.first().locator("xpath=ancestor::*[self::ul or self::ol][1]"));
      const nNotes = await del.count();
      for (let i = 0; i < nNotes; i++) await markIf(take, `memory note ${i + 1}`, del.nth(i).locator("xpath=ancestor::li[1]"));
      await markIf(take, "note 1 delete", del.first());
      await take.reveal(del.last(), { label: "to memory notes", align: 0.6 });
      // Rest near the notes, in the margin left of the list (no hover target there).
      const lb = await del.first().locator("xpath=ancestor::li[1]").boundingBox();
      await take.moveTo({ x: Math.max(40, lb.x - 36), y: lb.y + lb.height / 2 }, { label: "rest near notes" });
      await beat(take, 2.2);
      // Back to the app with the new button at the top.
      const back = page.getByRole("link", { name: "Back to the app" }).first();
      await take.reveal(back, { label: "to back link", align: 0.3 });
      await beat(take, 0.6);
      await markIf(take, "back to app button", back);
      await take.click(back, { label: "back to app" });
      await take.wait("app loaded", async () => {
        await page.locator("#composer-dock, #composer-hero").first().waitFor();
        await page.waitForLoadState("networkidle").catch(() => {});
        return "shown";
      });
      await park(take, "back to app park");
      // Let the studio finish loading its creatives before the end flashes (a busy page delays a
      // flash by several frames).
      await page.waitForLoadState("networkidle").catch(() => {});
      await beat(take, 2.4);
    },
    async truth(session, ctx, take) {
      return session.offCamera(async (page) => {
        const kit = await (await page.request.get(`${APP}/api/company/brand-kit`)).json();
        const m = await (await page.request.get(`${APP}/api/memory`)).json();
        const k = kit.brandKit ?? {};
        return { brandKit: kit.brandKit, ok: k.style === "signal" && k.ctaShape === "pill" && k.lead === "shop" && k.lockup === "bar", notes: m.records.length, framing: Object.fromEntries(Object.entries(take?.framing ?? {}).map(([k2, v]) => [k2, { rowTop: v.rowTop, rowBottom: v.rowBottom, cardTop: v.cardTop, cardBottom: v.cardBottom, bothFit: v.bothFit }])) };
      });
    },
  },

  // ---------------------------------------------------------------- 8. proof: second campaign
  {
    n: 8,
    name: "take-8-second-campaign",
    checkpoint: "CP7",
    async run(take, ctx) {
      const page = take.page;
      await beat(take, 1.0);
      await markIf(take, "chat pane", chat(page));
      await markIf(take, "composer", page.locator('form:has(textarea[id^="composer-"])'));
      const watcher = await sendChat(take, SENTENCES.second, { label: "second campaign" });
      await park(take, "second campaign send park");
      const res = await watchTurn(take, waitForTurn(take, watcher, { label: "second campaign reply" }), { prefix: "second", scrollLabel: "chat to latest" });
      ctx.turns = (ctx.turns ?? 0) + 1;
      ctx.results.second = res;
      if (res.outcome !== "success") throw new Error(`second campaign turn: ${res.outcome}`);
      await chatToEnd(take, "chat to reply").catch(() => {});
      await park(take, "chat to reply park");
      await beat(take, 2.0);
      await markOptionsReveal(take, "second");
      // Proof option: forced by ctx.proofOption, else the agent's own recommendation, else 1.
      const titles = await Promise.all([1, 2, 3].map((n) => optionTab(page, n).getAttribute("aria-label").then((l) => (l ?? "").replace(/^Option \d+:\s*/, "")).catch(() => "")));
      const pick = ctx.proofOption ? { n: ctx.proofOption, why: "set before the take" } : ((await agentPick(page, titles)) ?? { n: 1, why: "no recommendation found; option 1" });
      ctx.proof = pick;
      await markIf(take, "proof choice", optionTab(page, pick.n), { option: pick.n, why: pick.why });
      await clickPark(take, optionTab(page, pick.n), { label: `proof option ${pick.n}` });
      await showCreative(take, "proof to image");
      await beat(take, 2.0);
      await markIf(take, "proof image", previewImg(page));
      await markIf(take, "proof pill button", ctaHotspot(page));
      await markIf(take, "proof headline", headlineHotspot(page));
      await beat(take, 1.2);
      const text = postText(page);
      await take.reveal(text, { label: "to post text", align: 0.55 });
      await park(take, "to post text park");
      await beat(take, 1.2);
      await markIf(take, "post text", text);
      const sign = await textBox(text, "Free safety check for every customer");
      if (sign) await take.mark("proof sign-off", sign);
      else take.warn("sign-off sentence not found in post text");
      await beat(take, 1.8);
      await showCreative(take, "back to image");
      await beat(take, 1.2);
    },
    async truth(session, ctx, take) {
      return session.offCamera(async (page) => {
        const { list } = await campaigns(page);
        const c = list.at(-1);
        ctx.campaign2 = c.id;
        const out = { campaign: c.id, proof: ctx.proof, options: [] };
        for (const [i, o] of c.options.entries()) {
          const f = await downloadKit(page, c.id, o.id, ["instagram", "facebook"], path.join(take.dir, "kits", `option-${i + 1}.zip`));
          const copy = await zipText(f, "copy.txt");
          out.options.push({ id: o.id, title: o.title, headline: o.headline, cta: o.cta, signOffInKit: /Free safety check for every customer/.test(copy), kitFiles: await zipList(f), copy });
        }
        return out;
      });
    },
  },

  // ---------------------------------------------------------------- 9. export
  {
    n: 9,
    name: "take-9-export",
    checkpoint: null,
    async run(take, ctx) {
      const page = take.page;
      const dl = path.join(take.dir, "downloads");
      fs.mkdirSync(dl, { recursive: true });
      await beat(take, 1.0);
      if (ctx.proofOption && ctx.proofOption !== ctx.proof?.n) {
        // Proof on the option chosen after take 8 (take 8's automatic choice was not the best proof);
        // same labels as take 8's proof sequence.
        const n = ctx.proofOption;
        await markIf(take, "proof choice", optionTab(page, n), { option: n, why: ctx.proofWhy ?? "chosen after take 8" });
        await clickPark(take, optionTab(page, n), { label: `proof option ${n}` });
        await showCreative(take, "proof to image");
        await beat(take, 2.0);
        await markIf(take, "proof image", previewImg(page));
        await markIf(take, "proof pill button", ctaHotspot(page));
        await markIf(take, "proof headline", headlineHotspot(page));
        await beat(take, 1.2);
        const text = postText(page);
        await take.reveal(text, { label: "to post text", align: 0.55 });
        await park(take, "to post text park");
        await beat(take, 1.2);
        await markIf(take, "post text", text);
        const sign = await textBox(text, "Free safety check for every customer");
        if (sign) await take.mark("proof sign-off", sign);
        else take.warn("sign-off sentence not found in post text");
        await beat(take, 1.8);
        await showCreative(take, "back to image");
        await beat(take, 1.2);
      }
      await take.click(preview(page).getByRole("button", { name: "Export" }), { label: "export" });
      const sheet = page.locator('[role="dialog"]').last();
      await sheet.waitFor();
      await park(take, "export park");
      await beat(take, 1.4);
      await markIf(take, "export sheet", sheet);
      await markEach(take, "export tab", sheet.locator('[role="radio"]'));
      await markIf(take, "download zip", sheet.getByRole("link", { name: /Download everything/ }));
      await markEach(take, "image download", sheet.getByRole("link", { name: /^Download .* for / }));
      await markIf(take, "copy all", sheet.getByRole("button", { name: "Copy all copy" }));
      const tabs = sheet.locator('[role="radio"]');
      if ((await tabs.count()) > 1) {
        await clickPark(take, tabs.nth(1), { label: "export tab 2" });
        await beat(take, 1.3);
        await clickPark(take, tabs.nth(0), { label: "export tab 1" });
        await beat(take, 1.0);
      }
      const save = async (label, link) => {
        await beat(take, 0.4); // extra settle before the click (the sheet re-renders after tab changes)
        const ev = page.waitForEvent("download", { timeout: 30000 });
        await take.click(link, { label });
        const r = await take.wait(`${label} done`, async () => {
          const d = await ev;
          const f = path.join(dl, d.suggestedFilename());
          await d.saveAs(f);
          return { outcome: "saved", file: path.basename(f), bytes: fs.statSync(f).size };
        });
        await park(take, `${label} park`);
        return r;
      };
      await save("download zip", sheet.getByRole("link", { name: /Download everything/ }));
      await beat(take, 1.3);
      await save("download image", sheet.getByRole("link", { name: /^Download .* for / }).first());
      await beat(take, 1.3);
      const copy = sheet.getByRole("button", { name: "Copy all copy" });
      await take.reveal(copy, { label: "to copy", align: 0.6 }).catch(() => {});
      await beat(take, 0.4);
      await take.click(copy, { label: "copy text" });
      await park(take, "copy text park");
      await beat(take, 1.6);
      await markIf(take, "copied state", sheet.getByRole("button", { name: /Copy all copy|Copied/ }).first());
      await beat(take, 1.2);
      await take.click(sheet.getByRole("button", { name: "Close" }).first(), { label: "close export" });
      await sheet.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
      await park(take, "close export park");
      await beat(take, 1.2);
    },
    async truth(session, ctx, take) {
      return session.offCamera(async (page) => {
        const dl = path.join(take.dir, "downloads");
        const out = { downloads: [] };
        for (const f of fs.readdirSync(dl)) {
          const p = path.join(dl, f);
          out.downloads.push({ file: f, bytes: fs.statSync(p).size, ...(f.endsWith(".zip") ? { entries: await zipList(p) } : {}) });
        }
        out.clipboard = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => `unreadable: ${e.message}`);
        return out;
      });
    },
  },
];

/** Old name, kept for scripts written against the source project. */
export const TAKES = SCENES;
