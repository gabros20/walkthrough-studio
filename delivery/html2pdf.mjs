// HTML -> PDF (A4, backgrounds printed) and an optional full-page PNG, with Playwright's Chromium.
// usage: node delivery/html2pdf.mjs README.html README.pdf [preview.png]
// Playwright resolves from the recorder's install (recorder/node_modules/playwright-core) or any playwright on the
// module path; set PLAYWRIGHT_MODULE to an explicit index.mjs if neither is found.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
async function loadChromium() {
  const tries = [process.env.PLAYWRIGHT_MODULE, resolve(here, "../recorder/node_modules/playwright-core/index.mjs"), resolve(here, "../recorder/node_modules/playwright/index.mjs"), "playwright-core", "playwright"].filter(Boolean);
  for (const t of tries) {
    try {
      const m = await import(t.startsWith("/") ? pathToFileURL(t).href : t);
      return m.chromium ?? m.default?.chromium;
    } catch {}
  }
  for (const n of ["playwright-core", "playwright"]) { try { return createRequire(import.meta.url)(n).chromium; } catch {} }
  throw new Error("Playwright not found: run `npm install` in recorder/ or set PLAYWRIGHT_MODULE");
}

const [html, pdf, png] = process.argv.slice(2);
if (!html || !pdf) { console.error("usage: node delivery/html2pdf.mjs in.html out.pdf [out.png]"); process.exit(1); }
const chromium = await loadChromium();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
await page.goto(pathToFileURL(resolve(html)).href, { waitUntil: "load" });
await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
if (png) await page.screenshot({ path: png, fullPage: true });
await page.pdf({ path: pdf, format: "A4", printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(pdf);
