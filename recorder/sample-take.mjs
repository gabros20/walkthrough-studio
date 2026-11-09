// Records the ~15 s sample take on the synthetic page (calibration dot on): test footage for the
// film build and a quick end-to-end check of the recorder.
// Usage: node sample-take.mjs [takeName] [--mode new|shell|headed]
// Output: <takesDir>/<takeName>/ ($WALKTHROUGH_TAKES, else <repo>/takes). Then: node verify-dot.mjs <dir>
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openSession } from "./take.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const mi = args.indexOf("--mode");
const mode = mi >= 0 ? args.splice(mi, 2)[1] : "new";
const name = args[0] ?? "sample";
// The sample page's chip row scrolls when the mouse rests within 56 px of a faded edge.
const session = await openSession({ mode, calibrationDot: true, restGuard: { selector: ".edge-fade-x", zone: 56, margin: 8 } });
const { page } = session;
await page.goto(pathToFileURL(path.join(here, "pages", "sample.html")).href);
await page.waitForTimeout(800);

const take = await session.startTake(name, { overwrite: true });
await take.hold(0.6);
await take.click("#prompt", { label: "prompt field", at: { x: 0.3, y: 0.5 } });
await take.type("Winter tyre switch posts for this weekend", { label: "prompt text" });
await take.hold(0.3);
await take.click("#send", { label: "send" });
await take.wait("saved", async () => {
  await page.locator("#status.show").waitFor();
  await page.waitForTimeout(350);
  return "success";
});
await take.mark("status line", "#status");
await take.hold(0.5);
await take.click("#opt2", { label: "option 2" });
await take.hold(0.4);
await take.click("#opt3", { label: "option 3" });
await take.hold(0.4);
// The chip nearest the row's faded right edge: the rest guard keeps the pointer out of the zone.
const chip = await page.evaluate(() => {
  const row = document.getElementById("chips").getBoundingClientRect();
  const visible = [...document.querySelectorAll(".chip")].filter((c) => c.getBoundingClientRect().left < row.right - 20);
  return visible.at(-1).id;
});
await take.click(`#${chip}`, { label: "edge chip", at: { x: 0.85, y: 0.5 } });
await take.hold(0.4);
await take.moveTo("#list", { label: "history list", at: { x: 0.5, y: 0.4 } });
await take.scroll({ dy: 640, label: "history scroll" });
await take.mark("card 14", "#card14");
await take.hold(0.8);
const summary = await take.finish();
await session.close();
console.log(JSON.stringify({ dir: take.dir, sync: summary.sync, masterSync: summary.masterSync, warnings: summary.warnings, duration: summary.master.duration }, null, 2));
