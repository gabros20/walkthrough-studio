// Save a signed-in browser state for site mode (nothing is recorded). Opens a visible browser at the
// sign-in page; the owner signs in by hand with the test account (agents never type or see the
// password); when the page URL contains --until (or after --wait seconds without --until), the
// Playwright storage state (cookies, localStorage) is written to --out. Pass that file to the takes
// with --storage / WALKTHROUGH_STORAGE / the config's storageState.
//
//   node recorder/tools/save-login.mjs --url https://app.example.com/login --until /dashboard \
//        --out <project>/login.storage.json [--timeout 600] [--mode headed|new] [--viewport desktop|phone]
//
// The output is a credential: keep it out of git (*.storage.json is ignored here; ignore it in the
// project too) and never print its contents.
import fs from "node:fs";
import path from "node:path";
import { defaultConfig, parseArgs, sessionOptions } from "../config.mjs";
import { withSession } from "./explore.mjs";

const { flags } = parseArgs(process.argv.slice(2));
if (!flags.url || !flags.out || flags.help) {
  console.error("usage: save-login.mjs --url <sign-in URL> --out <file.storage.json> [--until <URL part>] [--wait s] [--timeout s] [--mode headed|new] [--viewport desktop|phone]");
  process.exit(flags.help ? 0 : 1);
}
const out = path.resolve(flags.out);
fs.mkdirSync(path.dirname(out), { recursive: true });
const config = defaultConfig({ viewport: flags.viewport });
const { storageState, ...opts } = sessionOptions(config, { heartbeat: false });
const timeout = Number(flags.timeout ?? 600) * 1000;

await withSession(
  async (page) => {
    await page.goto(flags.url);
    if (flags.until) {
      console.log(`sign in in the browser window; waiting up to ${timeout / 1000} s for a URL containing "${flags.until}"`);
      await page.waitForURL((u) => u.href.includes(flags.until), { timeout });
    } else {
      const s = Number(flags.wait ?? 90);
      console.log(`sign in in the browser window; saving in ${s} s`);
      await page.waitForTimeout(s * 1000);
    }
  },
  { ...opts, mode: flags.mode ?? "headed", state: out, save: true },
);
console.log(`saved storage state: ${out}`);
