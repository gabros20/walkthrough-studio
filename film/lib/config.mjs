// The film's fixed numbers and its brand. Every component reads these; change them here or in a
// brand file, never inside a component.
//
// Where the values come from, later wins:
//   1. the defaults below (a neutral brand on the proven layout)
//   2. a brand file: --brand <file> on the command line, else FILM_BRAND, else the storyboard's
//      "brand" field (relative to the storyboard), else <project>/brand.json when it exists
//   3. the brand file's "look" section (layout numbers: film, capture, window, band, camera, caption,
//      tag, type, pointer, wipe, cards)
//   4. the storyboard's "look" section (same keys), for one film only
// The schema is documented in film/brand.example.json and film/README.md ("Brand").
//
// Aspect (look.aspect "16:9" | "9:16" | "1:1"; --aspect on the command line, else FILM_ASPECT, else
// the storyboard's look.aspect, else the brand's, else 16:9) picks the canvas, and every layout
// number is derived from it and from the take (its events.json viewport and scale, read from the
// first scene's take): see deriveLook() below and docs/LOOK.md. 16:9 over a landscape take keeps
// the original fixed numbers exactly. Any derived number can still be overridden in a look section.
//
// The project folder (PROJECT_DIR) holds one film's inputs and receives every output; the kit's
// film/ folder (FILM_DIR) is code only. Found as, first match wins: --project <dir>, FILM_PROJECT,
// the storyboard's folder when it is a project (has hyperframes.json), the current directory when
// it has a storyboard.json or hyperframes.json, else the kit's film/ (developing the kit itself).

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The kit's film/ folder: code, never written to during use (except when developing in it). */
export const FILM_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Command-line options that take a value. A storyboard path is the first argument that is neither
// an option nor an option's value. A value option followed by another option (or nothing) is a flag
// (make-placeholder.mjs takes a bare --creatives; sync-assets.mjs takes --creatives <file>).
const VALUE_OPTS = new Set(["--brand", "--takes", "--dry-out", "--creatives", "--project", "--aspect", "--fit-audio", "--fit-gap", "--fit-max"]);
export function cliArgs(argv = process.argv.slice(2)) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_OPTS.has(a) && argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) opts[a.slice(2)] = argv[++i];
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
    label: null, // text after the divider (e.g. "Studio"); null for none
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

// The 16:9 layout over a landscape (desktop) take: the proven numbers, unchanged. Other aspects
// and phone takes derive theirs in deriveLook().
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
const readStoryboard = (p) => {
  try {
    return p && existsSync(p) ? readJson(p) : null;
  } catch {
    return null; // not readable here; the build reports bad JSON itself
  }
};
let storyboard = readStoryboard(sbArg ? resolve(sbArg) : null);

function projectDir() {
  if (typeof opts.project === "string") return resolve(opts.project);
  if (process.env.FILM_PROJECT) return resolve(process.env.FILM_PROJECT);
  if (sbArg && existsSync(join(dirname(resolve(sbArg)), "hyperframes.json"))) return dirname(resolve(sbArg));
  const cwd = process.cwd();
  if (["storyboard.json", "hyperframes.json"].some((f) => existsSync(join(cwd, f)))) return cwd;
  return FILM_DIR;
}
/** The film project: inputs and every output live here. */
export const PROJECT_DIR = projectDir();
// no storyboard argument: the project's own storyboard.json (what the build defaults to)
const SB_PATH = sbArg ? resolve(sbArg) : join(PROJECT_DIR, "storyboard.json");
if (!sbArg) storyboard = readStoryboard(SB_PATH);

/**
 * The take folders, first match wins: --takes, WALKTHROUGH_TAKES, the storyboard's "takesDir"
 * (relative to the storyboard), <project>/takes, else ../takes next to the project.
 */
export const TAKES_DIR =
  typeof opts.takes === "string"
    ? resolve(opts.takes)
    : process.env.WALKTHROUGH_TAKES
      ? resolve(process.env.WALKTHROUGH_TAKES)
      : storyboard?.takesDir
        ? isAbsolute(storyboard.takesDir) ? storyboard.takesDir : resolve(dirname(SB_PATH), storyboard.takesDir)
        : existsSync(join(PROJECT_DIR, "takes")) ? join(PROJECT_DIR, "takes") : resolve(PROJECT_DIR, "../takes");

/** The first scene's take as recorded: { name, viewport: { width, height }, scale }, or null. */
function firstTake() {
  const name = (storyboard?.scenes ?? []).find((s) => s && typeof s.take === "string")?.take;
  if (!name) return null;
  try {
    const ev = readJson(join(TAKES_DIR, name, "events.json"));
    if (!ev.viewport?.width || !ev.viewport?.height) return null;
    return { name, viewport: { width: ev.viewport.width, height: ev.viewport.height }, scale: ev.scale ?? 2 };
  } catch {
    return null; // no take here (a script that only needs the brand); the build reports a missing take itself
  }
}

function brandPath() {
  if (typeof opts.brand === "string") return resolve(opts.brand);
  if (process.env.FILM_BRAND) return resolve(process.env.FILM_BRAND);
  if (storyboard?.brand) return isAbsolute(storyboard.brand) ? storyboard.brand : resolve(dirname(SB_PATH), storyboard.brand);
  const local = join(PROJECT_DIR, "brand.json");
  return existsSync(local) ? local : null;
}

export const BRAND_FILE = brandPath();
if (BRAND_FILE && !existsSync(BRAND_FILE)) throw new Error(`brand file not found: ${BRAND_FILE}`);
const brandRaw = BRAND_FILE ? readJson(BRAND_FILE) : {};
export const BRAND = Object.freeze(deepMerge(DEFAULTS, brandRaw));

// ---------- aspect and layout ----------
/** The three aspect presets and their canvas. */
export const ASPECTS = Object.freeze({
  "16:9": Object.freeze({ width: 1920, height: 1080 }),
  "9:16": Object.freeze({ width: 1080, height: 1920 }),
  "1:1": Object.freeze({ width: 1080, height: 1080 }),
});
// The recorder's viewport presets (recorder/config.mjs), used when no take can be read.
const DESKTOP_CAPTURE = { width: 1440, height: 810, scale: 2 };
const PHONE_CAPTURE = { width: 390, height: 844, scale: 3 };
/** A phone-preset take: a narrow viewport (<= 500 CSS px) at a high density (scale >= 2). */
export const isPhoneViewport = (viewport, scale) => Boolean(viewport && viewport.width <= 500 && (scale ?? 1) >= 2);

const userLook = deepMerge(brandRaw.look ?? {}, storyboard?.look ?? {});
const aspectRaw = typeof opts.aspect === "string" ? opts.aspect : process.env.FILM_ASPECT || userLook.aspect || "16:9";
if (!ASPECTS[aspectRaw]) throw new Error(`unknown aspect "${aspectRaw}" (16:9 | 9:16 | 1:1; from ${typeof opts.aspect === "string" ? "--aspect" : process.env.FILM_ASPECT ? "FILM_ASPECT" : "look.aspect"})`);
/** The film's aspect: "16:9" | "9:16" | "1:1". */
export const ASPECT = aspectRaw;
const TAKE = firstTake();

/**
 * The layout defaults for an aspect and a capture. 16:9 over a landscape take: LOOK_DEFAULTS
 * unchanged (plus the keys that did not exist before, set to what the code did). Otherwise derived:
 *   canvas      the aspect's (1920x1080, 1080x1920, 1080x1080); s = min(width, height) / 1080
 *   band        the ink band at the bottom for captions and the time-lapse tag: 180 px (16:9),
 *               220 (1:1), 340 (9:16), times s
 *   window      the capture's aspect fitted into the area above the band, inside side margins of
 *               10% of the width and a top margin of height / 30 (16:9: 192 and 36), centred;
 *               with a phone bezel the fit includes the bezel (3.5% of the window width a side)
 *   caption     one line under the window (16:9: band top + 53); portrait and square: two lines
 *               at most, the plate at most 92% of the width, band top + 80 s, the tag on its own
 *               row above it (band top + 40 s)
 *   camera      focus at (width / 2, band top / 2); the control scale capped at the capture's
 *               pixel limit (master width / window width, less 1.3%), at most 1.85; whips scale
 *               with the width
 *   cards       16:9 "side" (text block left, slant column right); portrait and square "stacked"
 *               (lockup on top, the lines under it, the creatives as a strip along the bottom)
 */
function deriveLook(aspect, capture, scale, phone, bezelOn) {
  const { width: W, height: H } = ASPECTS[aspect];
  const s = Math.min(W, H) / 1080;
  const portrait = H > W, square = H === W;
  const stacked = portrait || square;
  if (aspect === "16:9" && capture.width >= capture.height)
    return deepMerge(LOOK_DEFAULTS, {
      capture: { width: capture.width, height: capture.height },
      wipe: { width: 3400 },
      cards: { layout: "side", lockupHeight: 84, gap: 64, x: null, through: { x: 1510, y: 700 }, cascade: { height: 640, base: 870, margin: 150 }, wallRows: 2 },
      camera: { whip: { out: 1600, in: 1100 } },
      tag: { row: null, safe: 96, clear: 48 },
    });
  const marginX = Math.round(0.1 * W), top = Math.round(H / 30);
  const bandTop = H - Math.round((portrait ? 340 : square ? 220 : 180) * s);
  // the window: the capture's aspect, fitted with its bezel into the area above the band
  const a = capture.width / capture.height;
  const beta = bezelOn ? BEZEL_SIDE : 0;
  const areaW = W - 2 * marginX, areaH = bandTop - top;
  let ww = Math.floor(Math.min(areaW / (1 + 2 * beta), areaH / (1 / a + 2 * beta)));
  ww -= ww % 2;
  const wh = Math.round(ww / a);
  const b = Math.round(beta * ww);
  const left = Math.round(marginX + (areaW - ww - 2 * b) / 2) + b;
  const wtop = Math.round(top + (areaH - wh - 2 * b) / 2) + b;
  // a phone's screen corners: the outer bezel radius is 2.4 x this (about 14% of the width)
  const radius = phone ? Math.round((0.14 * ww) / 2.4) : Math.max(8, Math.round((16 * ww) / 1536));
  const native = (capture.width * scale) / ww;
  const hi = Math.min(1.85, Math.floor(native * 0.987 * 100) / 100);
  const lo = Math.min(1.3, hi);
  const wipeTan = Math.tan((Math.abs(BRAND.shape.wipeSlantDeg) * Math.PI) / 180);
  const r = (v) => Math.round(v * s);
  return deepMerge(LOOK_DEFAULTS, {
    film: { width: W, height: H },
    capture: { width: capture.width, height: capture.height },
    window: { width: ww, height: wh, top: wtop, left, radius },
    band: { top: bandTop },
    camera: {
      paneScale: [lo, Math.min(1.5, hi)],
      controlScale: [lo, hi],
      focus: { x: W / 2, y: Math.round(bandTop / 2) },
      whip: { out: Math.round((1600 * W) / 1920), in: Math.round((1100 * W) / 1920) },
    },
    caption: stacked
      ? { top: bandTop + r(80), height: r(64), size: r(44), maxLines: 2, maxWidth: Math.round(0.92 * W), lineHeight: r(52) }
      : { top: bandTop + r(53), height: r(64), size: r(44) },
    tag: { row: stacked ? bandTop + r(40) : null, safe: r(96), clear: r(48) },
    type: { title: { size: stacked ? r(72) : r(92) }, tag: { size: r(28) } },
    // never larger against the app than at 16:9 (44 px over K 1.0667 = 41.25 CSS px)
    pointer: { size: Math.min(r(44), Math.round(41.25 * (ww / capture.width))) },
    wipe: { width: Math.round(W + 2 * wipeTan * H + 0.36 * W) },
    cards: stacked
      ? {
          layout: "stacked",
          lockupHeight: r(64),
          gap: r(44),
          x: Math.round(0.08 * W),
          strip: { height: Math.round((portrait ? 0.27 : 0.3) * H) },
          cascade: { height: Math.round((portrait ? 0.4 : 0.5) * H), base: Math.round(H / 2 + ((portrait ? 0.4 : 0.5) * H) / 2), margin: Math.round(0.08 * W) },
          wallRows: portrait ? 4 : 3,
        }
      : { layout: "side", lockupHeight: r(84), gap: r(64), x: marginX, through: { x: Math.round((1510 * W) / 1920), y: Math.round((700 * H) / 1080) }, cascade: { height: r(640), base: Math.round((870 * H) / 1080), margin: Math.round((150 * W) / 1920) }, wallRows: 2 },
  });
}
// bezel thickness a side, as a share of the window width
const BEZEL_SIDE = 0.035;

const takeCapture = TAKE ? { ...TAKE.viewport, scale: TAKE.scale } : null;
// the capture: an explicit look.capture wins (the build then checks every take against it), else
// the first take's viewport, else the recorder preset the aspect implies
const captureIn = {
  ...(takeCapture ?? (ASPECTS[ASPECT].height > ASPECTS[ASPECT].width ? PHONE_CAPTURE : DESKTOP_CAPTURE)),
  ...(userLook.capture ?? {}),
};
const captureScale = captureIn.scale ?? takeCapture?.scale ?? 2;
const phoneTake = isPhoneViewport(captureIn, captureScale);
const bezelWanted = userLook.bezel === false ? false : userLook.bezel === true || isObj(userLook.bezel) ? true : phoneTake;
const look = deepMerge(deepMerge(deriveLook(ASPECT, captureIn, captureScale, phoneTake, bezelWanted), brandRaw.look ?? {}), storyboard?.look ?? {});

/**
 * Resolve a path written in the brand file: "${NAME}" is replaced by the environment variable NAME
 * (so a brand file can point into another checkout without a machine-specific path), then a
 * relative path is taken relative to the brand file (the project when there is none).
 */
export const brandAsset = (p) => {
  if (!p) return null;
  const x = String(p).replace(/\$\{(\w+)\}/g, (_, name) => {
    if (!process.env[name]) throw new Error(`brand path ${p}: environment variable ${name} is not set`);
    return process.env[name];
  });
  return isAbsolute(x) ? x : resolve(BRAND_FILE ? dirname(BRAND_FILE) : PROJECT_DIR, x);
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

export const CAPTURE = Object.freeze({ width: look.capture.width, height: look.capture.height });

export const WINDOW = Object.freeze({ ...look.window });

// Capture px -> stage px (window-local, at wide framing).
export const K = WINDOW.width / CAPTURE.width;

/**
 * The recording the layout was made for: { viewport, scale, phone, take }. viewport = CAPTURE;
 * phone = a phone-preset take (<= 500 CSS px wide at scale >= 2); take = the first scene's take name
 * when it could be read (null: the layout fell back to the recorder preset the aspect implies).
 */
export const DEVICE = Object.freeze({ viewport: CAPTURE, scale: captureScale, phone: phoneTake, take: TAKE?.name ?? null });

/**
 * The layout switches: aspect, whether a landscape take may be letterboxed in 9:16
 * (look.allowLetterbox), and the card layout ("side" | "stacked").
 */
export const LAYOUT = Object.freeze({
  aspect: ASPECT,
  allowLetterbox: look.allowLetterbox === true,
  portrait: look.film.height > look.film.width,
  cards: look.cards.layout,
});

/** The top of the ink band for captions and the tag: zoomed framings keep the window above it. */
export const BAND = Object.freeze({ top: look.band?.top ?? WINDOW.top + WINDOW.height });

/**
 * The phone bezel, or null: a neutral device frame drawn around the footage (lib/stage.mjs) when
 * the take is a phone preset; look.bezel false turns it off, true (or an object) forces it.
 * thickness: 3.5% of the window width a side; outerRadius: the window radius x 2.4; the footage is
 * clipped to innerRadius (outer - thickness). An object may override thickness, outerRadius, body,
 * ring and ringWidth.
 */
export const BEZEL = (() => {
  if (!bezelWanted) return null;
  const o = isObj(look.bezel) ? look.bezel : {};
  const thickness = o.thickness ?? Math.round(BEZEL_SIDE * WINDOW.width);
  const outerRadius = o.outerRadius ?? Math.round(WINDOW.radius * 2.4);
  return Object.freeze({
    thickness,
    outerRadius,
    innerRadius: Math.max(0, outerRadius - thickness),
    body: o.body ?? "#0B0B0B",
    ring: o.ring ?? BRAND.colors.plate,
    ringWidth: o.ringWidth ?? 2,
  });
})();

export const CAMERA = Object.freeze({ ...look.camera });

export const CAPTION = Object.freeze({
  ...look.caption,
  slantDeg: -Math.abs(BRAND.shape.slantDeg), // CSS skewX: negative leans the plate "/"
  plate: BRAND.colors.plate,
  charWidth: BRAND.font.captionCharEm * look.caption.size,
});

/** Time-lapse tag placement: row = its own centre line above the caption (null: beside the plate). */
export const TAG = Object.freeze({ ...look.tag });

export const TYPE = Object.freeze({ ...look.type });

export const POINTER = Object.freeze({ ...look.pointer });

/** The accent wipe panel's width (wide enough to cover the frame while leaning). */
export const WIPE = Object.freeze({ ...look.wipe });

/** Title and end card layout ("side" or "stacked") and its numbers. */
export const CARDS = Object.freeze({ ...look.cards, x: look.cards.x ?? WINDOW.left });

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
