// Copies the brand's logo files and the creatives named in a creatives file into film/assets/, and
// writes the manifests the title and end cards read:
//   assets/brand/manifest.json      { onDark: { src, w, h }, onLight: { src, w, h } }  (only with a logo)
//   assets/creatives/manifest.json  [{ id, src, w, h, crop? }]
//
//   node scripts/sync-assets.mjs [--brand <brand.json>] [--creatives <creatives.json>]
//
// The brand file is found as in lib/config.mjs (--brand, FILM_BRAND, film/brand.json). Logo paths in
// it are relative to the brand file. The creatives file defaults to the brand's "assets.creatives",
// else film/creatives.json; its "sourceDir" is relative to the creatives file, and an item's
// "source" is relative to sourceDir unless absolute. Run again after editing either file.
// Pixel sizes are read with ffprobe (raster) or the SVG's viewBox / width / height.

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, extname, isAbsolute, join, resolve } from "node:path";
import { BRAND, BRAND_FILE, FILM_DIR, brandAsset, cliArgs } from "../lib/config.mjs";

const { opts } = cliArgs();

/** { w, h } of an image file. */
function size(file) {
  if (extname(file).toLowerCase() === ".svg") {
    const svg = readFileSync(file, "utf8");
    const vb = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg);
    if (vb) return { w: Number(vb[1]), h: Number(vb[2]) };
    const w = /\swidth="([\d.]+)/.exec(svg), h = /\sheight="([\d.]+)/.exec(svg);
    if (w && h) return { w: Number(w[1]), h: Number(h[1]) };
    throw new Error(`${file}: no viewBox or width/height`);
  }
  const out = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { encoding: "utf8" }).trim();
  const [w, h] = out.split(",").map(Number);
  if (!(w > 0 && h > 0)) throw new Error(`${file}: could not read the pixel size`);
  return { w, h };
}

// ---------- logos ----------
const logo = BRAND.lockup.logo;
mkdirSync(join(FILM_DIR, "assets/brand"), { recursive: true });
if (logo) {
  const brandManifest = {};
  for (const tone of ["onDark", "onLight"]) {
    const from = brandAsset(logo[tone] ?? logo.onDark ?? logo.onLight);
    if (!from || !existsSync(from)) throw new Error(`logo ${tone}: file not found: ${from} (paths in ${BRAND_FILE} are relative to it)`);
    const rel = `assets/brand/logo-${tone === "onDark" ? "on-dark" : "on-light"}${extname(from).toLowerCase()}`;
    copyFileSync(from, join(FILM_DIR, rel));
    brandManifest[tone] = { src: rel, ...size(from) };
  }
  writeFileSync(join(FILM_DIR, "assets/brand/manifest.json"), JSON.stringify(brandManifest, null, 2) + "\n");
  console.log(`synced the logo (${brandManifest.onDark.w}x${brandManifest.onDark.h}) from ${BRAND_FILE}`);
} else {
  writeFileSync(join(FILM_DIR, "assets/brand/manifest.json"), "{}\n");
  console.log("no logo in the brand: the lockup is text only");
}

// ---------- creatives ----------
const cfgPath =
  typeof opts.creatives === "string" ? resolve(opts.creatives)
  : BRAND.assets?.creatives ? brandAsset(BRAND.assets.creatives)
  : join(FILM_DIR, "creatives.json");
if (!existsSync(cfgPath)) {
  console.log(`no creatives file at ${cfgPath}: creatives not synced (node scripts/make-placeholder.mjs writes stand-ins)`);
  process.exit(0);
}
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const srcDir = cfg.sourceDir ? (isAbsolute(cfg.sourceDir) ? cfg.sourceDir : resolve(dirname(cfgPath), cfg.sourceDir)) : dirname(cfgPath);
mkdirSync(join(FILM_DIR, "assets/creatives"), { recursive: true });
const out = [];
for (const it of cfg.items) {
  const src = isAbsolute(it.source) ? it.source : join(srcDir, it.source);
  if (!existsSync(src)) throw new Error(`creative ${it.id}: file not found: ${src}`);
  const rel = `assets/creatives/${it.id}${extname(src).toLowerCase()}`;
  copyFileSync(src, join(FILM_DIR, rel));
  out.push({ id: it.id, src: rel, ...size(src), ...(it.crop ? { crop: it.crop } : {}) });
}
writeFileSync(join(FILM_DIR, "assets/creatives/manifest.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`synced ${out.length} creatives from ${cfgPath}`);
