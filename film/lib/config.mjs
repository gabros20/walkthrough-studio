// The film's fixed numbers and its brand. Every component reads these; change them here or in a
// brand file, never inside a component.
//
// Where the values come from, later wins:
//   1. the defaults below (a neutral brand on the proven layout)
//   2. a brand file: --brand <file> on the command line, else FILM_BRAND, else the storyboard's
//      "brand" field (relative to the storyboard), else film/brand.json when it exists
//   3. the brand file's "look" section (layout numbers: film, capture, window, camera, caption,
//      type, pointer)
//   4. the storyboard's "look" section (same keys), for one film only
// The schema is documented in film/brand.example.json and film/README.md ("Brand").

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FILM_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Command-line options that take a value. A storyboard path is the first argument that is neither
// an option nor an option's value.
const VALUE_OPTS = new Set(["--brand", "--takes", "--dry-out", "--creatives"]);
export function cliArgs(argv = process.argv.slice(2)) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_OPTS.has(a)) opts[a.slice(2)] = argv[++i];
    else if (a.startsWith("--")) opts[a.slice(2)] = true;
    else positional.push(a);
  }
  return { opts, positional };
}

// ---------- defaults: a neutral brand ----------
const DEFAULTS = {
  name: "Product",
  colors: {
    ink: "#141414", // ground, the band under the window, spotlight dim
    paper: "#F4F2EE", // the window's background behind the footage
    accent: "#3D63FF", // the one brand colour: wipes and the caption tick
    text: "#FFFFFF", // type on ink
    muted: "rgba(244,242,238,0.66)", // secondary type on ink (lockup label, time-lapse tag)
    plate: "#262626", // caption plate: ink lifted one step so it reads on the ink band
    ghost: "#3c3c3c", // a title line before it lights up word by word
  },
  font: {
    family: "Roboto", // must be installed where the film renders (or render with --docker)
    fallback: "Helvetica, Arial, sans-serif",
    captionCharEm: 0.489, // average caption character width in em at the caption weight (Roboto Bold)
  },
  shape: {
    slantDeg: 16, // lean of the caption plate, its tick and the title/end column edge
    wipeSlantDeg: 20, // lean of the wipe panel and its leading bar
  },
  lockup: {
    // logo: null, or { onDark, onLight, aspect }: file paths relative to the brand file (or already
    // synced into film/assets/brand by scripts/sync-assets.mjs); aspect = width / height
    logo: null,
    label: null, // text after the divider ("Content AI"); null for none
    divider: true, // the hairline between logo (or wordmark) and label; only drawn with a label
    wordmark: null, // text drawn when there is no logo; defaults to "name"; "" for none
    // Proportions on a 24-unit row, scaled to the requested logo height.
    metrics: {
      row: 24,
      gap: 10,
      dividerWidth: 1,
      dividerHeight: 16,
      dividerDrop: 6,
      labelSize: 14,
      labelWeight: 500,
      labelTracking: "-0.01em",
      labelDrop: 10,
      labelEm: 0.5, // average label character width in em, for layout estimates only
      wordmarkSize: 22,
      wordmarkWeight: 800,
      wordmarkTracking: "-0.02em",
    },
  },
  cards: {
    title: ["One sentence in.", "A finished result out."],
    end: ["From one request", "to every channel."],
  },
};

const LOOK_DEFAULTS = {
  film: { width: 1920, height: 1080 },
  // The capture space the recorder logs points and boxes in (CSS px of the recorded page).
  capture: { width: 1440, height: 810 },
  // The app window at wide framing.
  window: { width: 1536, height: 864, top: 36, left: 192, radius: 16, shadow: "0 28px 70px rgba(0,0,0,.45)" },
  camera: {
    ease: "power2.inOut",
    moveSeconds: 0.5, // 0.45-0.6
    paneScale: [1.3, 1.5],
    controlScale: [1.3, 1.85], // 1.85 = a 2x capture's native pixel limit (2880 / 1536 = 1.875)
    focus: { x: 960, y: 450 }, // where a framed box is centred: the middle of the area above the caption band
    fill: { pane: 0.92, control: 0.5 }, // share of the canvas a framed box may fill before the scale caps
  },
  caption: {
    top: 953, // plate spans 953-1017, centred at y 985 in the ink band under the window (never past 1026)
    height: 64,
    size: 44,
    weight: 700,
    maxWords: 10,
  },
  type: {
    title: { size: 92, weight: 900, tracking: "-0.015em", lineHeight: 1.04 },
    tag: { size: 28, weight: 500 },
  },
  pointer: { size: 44, fill: "#141414", edge: "#fff", disc: "#141414" },
};

// ---------- load ----------
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
function deepMerge(a, b) {
  if (!isObj(b)) return b === undefined ? a : b;
  const out = { ...(isObj(a) ? a : {}) };
  for (const [k, v] of Object.entries(b)) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : v;
  return out;
}
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const { opts, positional } = cliArgs();
const sbArg = positional.find((a) => a.endsWith(".json"));
let storyboard = null;
try {
  if (sbArg && existsSync(resolve(sbArg))) storyboard = readJson(resolve(sbArg));
} catch {
  storyboard = null; // not readable here; the build reports bad JSON itself
}

function brandPath() {
  if (typeof opts.brand === "string") return resolve(opts.brand);
  if (process.env.FILM_BRAND) return resolve(process.env.FILM_BRAND);
  if (storyboard?.brand) return isAbsolute(storyboard.brand) ? storyboard.brand : resolve(dirname(resolve(sbArg)), storyboard.brand);
  const local = join(FILM_DIR, "brand.json");
  return existsSync(local) ? local : null;
}

export const BRAND_FILE = brandPath();
if (BRAND_FILE && !existsSync(BRAND_FILE)) throw new Error(`brand file not found: ${BRAND_FILE}`);
const brandRaw = BRAND_FILE ? readJson(BRAND_FILE) : {};
export const BRAND = Object.freeze(deepMerge(DEFAULTS, brandRaw));
const look = deepMerge(deepMerge(LOOK_DEFAULTS, brandRaw.look ?? {}), storyboard?.look ?? {});

/**
 * Resolve a path written in the brand file: "${NAME}" is replaced by the environment variable NAME
 * (so a brand file can point into another checkout without a machine-specific path), then a
 * relative path is taken relative to the brand file (film/ when there is none).
 */
export const brandAsset = (p) => {
  if (!p) return null;
  const x = String(p).replace(/\$\{(\w+)\}/g, (_, name) => {
    if (!process.env[name]) throw new Error(`brand path ${p}: environment variable ${name} is not set`);
    return process.env[name];
  });
  return isAbsolute(x) ? x : resolve(BRAND_FILE ? dirname(BRAND_FILE) : FILM_DIR, x);
};

// ---------- the constants every component uses ----------
export const FILM = Object.freeze({
  // 30 by default; 60 when the capture supports it (FILM_FPS, or "fps" in the storyboard).
  // Every time is snapped to this grid.
  fps: Number(process.env.FILM_FPS) || Number(storyboard?.fps) || 30,
  width: look.film.width,
  height: look.film.height,
  font: BRAND.font.family,
  // the CSS font-family value: the brand font, then its fallbacks
  fontStack: `"${BRAND.font.family}", ${BRAND.font.fallback}`,
});

export const COLOR = Object.freeze({ ...BRAND.colors, white: BRAND.colors.text });

export const CAPTURE = Object.freeze({ ...look.capture });

export const WINDOW = Object.freeze({ ...look.window });

// Capture px -> stage px (window-local, at wide framing).
export const K = WINDOW.width / CAPTURE.width;

export const CAMERA = Object.freeze({ ...look.camera });

export const CAPTION = Object.freeze({
  ...look.caption,
  slantDeg: -Math.abs(BRAND.shape.slantDeg), // CSS skewX: negative leans the plate "/"
  plate: BRAND.colors.plate,
  charWidth: BRAND.font.captionCharEm * look.caption.size,
});

export const TYPE = Object.freeze({ ...look.type });

export const POINTER = Object.freeze({ ...look.pointer });

export const SHAPE = Object.freeze({ slantDeg: Math.abs(BRAND.shape.slantDeg), wipeSlantDeg: Math.abs(BRAND.shape.wipeSlantDeg) });

export const EASE = Object.freeze({
  arrive: "expo.out",
  camera: "power2.inOut",
  exit: "power3.in",
});

/** Snap a time in seconds to the frame grid. */
export const snap = (t) => Math.round(t * FILM.fps) / FILM.fps;
/** One frame in seconds. */
export const frame = () => 1 / FILM.fps;
