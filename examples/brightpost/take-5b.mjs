// Pickup take 5b: the Display ads (and Newsletter) format tour with every creative really loaded.
// Run on CP3 state (after the redesign): adds the five platforms off camera, sets the screen as
// take 5's tour had it just before it clicked Display ads (option 1, English, LinkedIn tab on its
// last format), then records the tour, waiting for each image to load.
//
// A standalone take script (no runner): shows how to use the config, the adapter and the core
// directly when one take has to be re-shot on its own.
// Usage: node examples/brightpost/take-5b.mjs <storageState.json> [--config walkthrough.config.mjs]
//   (storage state: <checkpoints>/CP3/storage.json, after studio/bin/restore.sh CP3)
import fs from "node:fs";
import path from "node:path";
import { nowWall } from "../../recorder/capture.mjs";
import { loadAdapter, loadConfig, parseArgs, sessionOptions } from "../../recorder/config.mjs";
import { openSession } from "../../recorder/take.mjs";
import { beat, markEach, markIf, visibleFirst } from "../../recorder/takes/lib.mjs";
import { APP, guardKeys, preview } from "./app.mjs";

const { flags, rest } = parseArgs(process.argv.slice(2));
const config = await loadConfig(flags.config ?? new URL("./walkthrough.config.mjs", import.meta.url), { storageState: rest[0] });
const adapter = await loadAdapter(config);
const session = await openSession(sessionOptions(config));
session.adapter = adapter;
session.config = config;
const page = session.page;
const pv = preview(page);
const tab = (name) => pv.locator('[role="radio"]').filter({ hasText: new RegExp(`^${name}$`) }).first();
const formatRow = () => visibleFirst(pv.locator('[role="radiogroup"].edge-fade-x'));
const previewImg = () => visibleFirst(pv.locator('img[alt*="preview of option"]'));

/** Every creative image in the preview complete, and no loader/skeleton inside the creative frames. */
async function loadedState() {
  return pv.evaluate((p) => {
    const imgs = [...p.querySelectorAll('img[alt*="preview of option"]')].filter((im) => im.getBoundingClientRect().width > 0);
    const busy = [...p.querySelectorAll(".skeleton, .agent-working")].filter((el) => el.getBoundingClientRect().width > 0).length;
    return { imgs: imgs.length, complete: imgs.filter((im) => im.complete && im.naturalWidth > 0).length, busy };
  });
}
async function waitLoaded(take, label) {
  return take.wait(label, async () => {
    const t0 = nowWall();
    let last;
    while (nowWall() - t0 < 30) {
      last = await loadedState();
      if (last.imgs > 0 && last.complete === last.imgs && last.busy === 0) return { outcome: "loaded", seconds: Math.round((nowWall() - t0) * 100) / 100, ...last };
      await page.waitForTimeout(150);
    }
    return { outcome: "timeout", seconds: 30, ...last };
  });
}

// ---- off camera: platforms and starting screen
const requests = [];
page.on("response", (r) => {
  if (/\/api\/creatives\//.test(r.url())) requests.push({ status: r.status(), path: new URL(r.url()).pathname });
});
await page.goto(`${APP}/`);
await page.waitForTimeout(2500);
await pv.locator('[role="radio"][aria-label^="Option 1:"]').filter({ visible: true }).first().click();
await page.waitForTimeout(1000);
for (const name of ["LinkedIn", "Facebook", "TikTok", "Display ads", "Newsletter"]) {
  if (await tab(name).count()) continue;
  await pv.getByRole("button", { name: "Add a platform" }).click();
  await page.locator('[role="menu"] [role^="menuitem"]').filter({ hasText: name }).first().click();
  await tab(name).waitFor();
  await page.waitForTimeout(2500);
}
await tab("LinkedIn").click();
await page.waitForTimeout(1500);
await formatRow().locator('[role="radio"]').last().click();
await page.waitForTimeout(2500);
await page.mouse.move(1290, 300);
session.pointer = { x: 1290, y: 300 };

// ---- on camera
const take = guardKeys(await session.startTake("take-5b-display-tour", { overwrite: true }));
await beat(take, 1.0);
await markIf(take, "tab row", visibleFirst(pv.locator(".edge-fade-x").filter({ has: page.locator('[role="radio"]') })));
await markEach(take, "tab", pv.locator('[role="radio"]').filter({ hasText: /^(Instagram|Facebook|TikTok|LinkedIn|Display ads|Newsletter)$/ }));
const results = [];
for (const name of ["Display ads", "Newsletter"]) {
  await take.click(tab(name), { label: `tour ${name}` });
  const first = await waitLoaded(take, `${name} format 1 loaded`);
  results.push({ platform: name, format: 1, ...first });
  if (first.outcome !== "loaded") break;
  // Display ads sit inside a mock web page, often below the fold of the preview pane: scroll the
  // pane with the wheel until the ad itself is in view.
  await take.reveal(previewImg(), { label: `${name} to ad 1`, align: 0.5 });
  await beat(take, 1.2);
  await markIf(take, `${name} format row`, formatRow());
  await markEach(take, `${name} chip`, formatRow().locator('[role="radio"]'), (i, t) => t.replace(/\d+×\d+$/, "").trim());
  await markIf(take, `${name} image 1`, previewImg());
  const chips = formatRow().locator('[role="radio"]');
  const n = await chips.count();
  for (let i = 1; i < n; i++) {
    await take.click(chips.nth(i), { label: `${name} format ${i + 1}`, lead: 0.12 });
    const r = await waitLoaded(take, `${name} format ${i + 1} loaded`);
    results.push({ platform: name, format: i + 1, ...r });
    await take.reveal(previewImg(), { label: `${name} to ad ${i + 1}`, align: 0.5 });
    await beat(take, 0.8);
    await markIf(take, `${name} image ${i + 1}`, previewImg());
  }
}
await beat(take, 0.6);
const summary = await take.finish({ keepRaw: false });
fs.writeFileSync(path.join(take.dir, "truth.json"), `${JSON.stringify({ loads: results, creativeResponses: requests }, null, 2)}\n`);
await session.close();
console.log(JSON.stringify({ sync: summary.masterSync.pass, start: summary.masterSync.startMedianErrorFrames, end: summary.masterSync.endMedianErrorFrames, gaps: summary.gaps, duration: summary.master.duration, loads: results.map((r) => `${r.platform} ${r.format}: ${r.outcome} ${r.seconds}s (${r.complete}/${r.imgs}, busy ${r.busy})`), failedCreatives: requests.filter((r) => r.status >= 400) }, null, 1));
