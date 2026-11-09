// Look at the app before writing a scene (nothing is recorded): open a page at the take viewport,
// optionally signed in with a checkpoint's storage state, print the interactive elements in view
// with their boxes, and save a screenshot.
//
//   node recorder/tools/inspect.mjs --config <walkthrough.config.mjs> [--path /settings]
//        [--storage <checkpoints>/CP1/storage.json] [--out dir] [--hover "<selector>"] [--wait ms]
//        [--viewport desktop|phone] [--base-url URL] (without --config: defaults + these flags)
//
// --hover moves the mouse onto the element first (check hover states and where the pointer may
// rest); --out defaults to ./inspect. Uses the config's viewport, scale and baseUrl.
import fs from "node:fs";
import path from "node:path";
import { defaultConfig, loadConfig, parseArgs, sessionOptions } from "../config.mjs";
import { outline, withSession } from "./explore.mjs";

const { flags } = parseArgs(process.argv.slice(2));
const config = flags.config
  ? await loadConfig(flags.config, { baseUrl: flags["base-url"], storageState: flags.storage, viewport: flags.viewport })
  : defaultConfig({ baseUrl: flags["base-url"], storageState: flags.storage, viewport: flags.viewport });
const out = path.resolve(flags.out ?? "inspect");
fs.mkdirSync(out, { recursive: true });
const url = /^https?:|^file:/.test(flags.path ?? "") ? flags.path : `${config.baseUrl}${flags.path ?? "/"}`;
const { storageState, ...opts } = sessionOptions(config, { heartbeat: false });

await withSession(
  async (page) => {
    await page.goto(url);
    await page.waitForTimeout(Number(flags.wait ?? 1500));
    if (flags.hover) {
      await page.locator(flags.hover).first().hover();
      await page.waitForTimeout(400);
    }
    const name = (flags.path ?? "root").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "root";
    const shot = path.join(out, `${name}.png`);
    await page.screenshot({ path: shot });
    console.log(`# ${page.url()}\n# screenshot: ${shot}\n`);
    console.log(await outline(page));
  },
  { ...opts, state: storageState, save: false },
);
