// Project config for the take runner: loads walkthrough.config.mjs, fills defaults, resolves paths
// relative to the config file, then applies environment variables and CLI flags (flags win).
//
// The config is the only place the recorder learns about an app. The core never imports app code;
// it loads the adapter and scenes modules named here.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Viewport presets. `viewport: "desktop"` or `"phone"` in a config picks one; an object
 * { width, height } with `scale` is a custom desktop viewport.
 * phone: Chromium with mobile emulation (isMobile, touch, an iPhone user agent). The master is
 * width x scale by height x scale (1170x2532 for phone).
 */
export const VIEWPORTS = Object.freeze({
  desktop: { width: 1440, height: 810, scale: 2, device: null },
  phone: {
    width: 390,
    height: 844,
    scale: 3,
    device: {
      isMobile: true,
      hasTouch: true,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    },
  },
});

export const DEFAULTS = Object.freeze({
  name: "walkthrough",
  baseUrl: "http://localhost:3000",
  viewport: "desktop", // "desktop" | "phone" | { width, height } (then scale applies)
  scale: null, // default: the preset's scale (2 for desktop and custom viewports)
  fps: 60,
  // Site mode (any website, no studio): requests to drop, and banners to click away off camera
  // before each take's sync flashes.
  blockUrls: [], // glob strings ("**/gtag/**") or RegExp; matching requests are aborted
  dismiss: [], // selectors (or { role, name } targets) clicked if visible: cookie / consent banners
  // Safe band for click and mark targets (CSS px from the top / bottom of the viewport): before a
  // click (and a mark of an element near the edge) the recorder wheel-scrolls the element inside
  // it, so the film's crop never cuts it. on: which actions do this automatically.
  safeArea: { top: 0, bottom: 120, on: ["click", "mark"] },
  // A page that opens a new tab or window: "same-tab" turns it into a navigation of the same page,
  // "follow" moves the screencast to the new page (a hard cut), "block" closes it. Logged as nav.
  popups: "same-tab",
  // alert / confirm / prompt / beforeunload: answered at once ("accept" | "dismiss") and logged.
  dialogs: "accept",
  takesDir: "./takes",
  runnerDir: null, // default <takesDir>/_runner
  adapter: null, // module path, optional
  scenes: "./scenes.mjs",
  storageState: null,
  session: {
    mode: "new",
    heartbeat: true,
    calibrationDot: false,
    pointerStart: null, // default { x: 0.75 * width, y: height + 40 } (enters from below)
    restGuard: null,
    context: {},
    launchArgs: [],
  },
  finish: { keepRaw: false, crf: 12, preset: "medium" },
  // A take is ok when the scene did not throw, the master sync check passed, and the longest
  // capture gap outside waits is at most maxGapMs. Real apps stall capture for 100-260 ms on some
  // re-layouts; raise this if you list such stalls instead of retaking (see docs/CAPTURE_TEST.md).
  gate: { maxGapMs: 100 },
  reload: { path: "/", settleMs: 2500 },
  studio: null, // { bin, config, checkpointsDir? }
  project: {},
});

const ENV = {
  WALKTHROUGH_BASE_URL: "baseUrl",
  WALKTHROUGH_TAKES: "takesDir",
  WALKTHROUGH_STORAGE: "storageState",
  WALKTHROUGH_MODE: "session.mode",
  WALKTHROUGH_VIEWPORT: "viewport",
  WALKTHROUGH_POPUPS: "popups",
  WALKTHROUGH_ADAPTER: "adapter",
  WALKTHROUGH_SCENES: "scenes",
  STUDIO_CONFIG: "studio.config",
};

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) {
    if (v === undefined) continue;
    out[k] = isObj(v) && isObj(a?.[k]) ? merge(a[k], v) : v;
  }
  return out;
}
function setPath(obj, dotted, value) {
  const keys = dotted.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k] = isObj(o[k]) ? { ...o[k] } : {};
  o[keys.at(-1)] = value;
}

/**
 * Load a config file (path or file URL) and return the resolved config.
 * `overrides` uses the same dotted keys as ENV values ("baseUrl", "session.mode", ...).
 */
export async function loadConfig(file, overrides = {}) {
  const abs = file instanceof URL ? fileURLToPath(file) : path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`config not found: ${abs}`);
  const mod = await import(pathToFileURL(abs).href);
  const raw = typeof mod.default === "function" ? await mod.default() : mod.default ?? mod.config;
  if (!isObj(raw)) throw new Error(`${abs}: export default a config object (or a function returning one)`);
  let c = merge(DEFAULTS, raw);
  for (const [env, key] of Object.entries(ENV)) if (process.env[env]) setPath(c, key, process.env[env]);
  for (const [key, v] of Object.entries(overrides)) if (v !== undefined) setPath(c, key, v);
  return resolveConfig(c, path.dirname(abs), abs);
}

/** Config with no file (sample scripts): defaults, env, overrides; paths relative to cwd. */
export function defaultConfig(overrides = {}) {
  let c = merge(DEFAULTS, {});
  for (const [env, key] of Object.entries(ENV)) if (process.env[env]) setPath(c, key, process.env[env]);
  for (const [key, v] of Object.entries(overrides)) if (v !== undefined) setPath(c, key, v);
  return resolveConfig(c, process.cwd(), null);
}

function resolveConfig(c, base, file) {
  const abs = (p) => (p ? path.resolve(base, p) : p);
  c.file = file;
  c.dir = base;
  c.baseUrl = String(c.baseUrl).replace(/\/+$/, "");
  c.takesDir = abs(c.takesDir);
  c.runnerDir = c.runnerDir ? abs(c.runnerDir) : path.join(c.takesDir, "_runner");
  c.adapter = abs(c.adapter);
  c.scenes = abs(c.scenes);
  c.storageState = abs(c.storageState) || undefined;
  if (c.studio) {
    c.studio = { ...c.studio, bin: abs(c.studio.bin), config: abs(c.studio.config) };
    if (c.studio.checkpointsDir) c.studio.checkpointsDir = abs(c.studio.checkpointsDir);
  }
  const preset = typeof c.viewport === "string" ? VIEWPORTS[c.viewport] : null;
  if (typeof c.viewport === "string" && !preset) throw new Error(`unknown viewport preset "${c.viewport}" (desktop | phone)`);
  c.preset = typeof c.viewport === "string" ? c.viewport : "custom";
  c.device = preset?.device ?? c.device ?? null;
  c.scale = c.scale ?? preset?.scale ?? 2;
  c.viewport = preset ? { width: preset.width, height: preset.height } : { width: c.viewport.width, height: c.viewport.height };
  const { width, height } = c.viewport;
  c.session = { ...c.session, pointerStart: c.session.pointerStart ?? { x: Math.round(width * 0.75), y: height + 40 } };
  return c;
}

/** openSession() options from a config. */
export function sessionOptions(c, extra = {}) {
  return {
    mode: c.session.mode,
    scale: c.scale,
    width: c.viewport.width,
    height: c.viewport.height,
    heartbeat: c.session.heartbeat,
    calibrationDot: c.session.calibrationDot,
    pointerStart: c.session.pointerStart,
    restGuard: c.session.restGuard,
    context: c.session.context,
    launchArgs: c.session.launchArgs,
    storageState: c.storageState,
    takesDir: c.takesDir,
    device: c.device,
    blockUrls: c.blockUrls,
    dismiss: c.dismiss,
    safeArea: c.safeArea,
    popups: c.popups,
    dialogs: c.dialogs,
    ...extra,
  };
}

/** Load the adapter module (or an empty one). Calls its init(config) once. */
export async function loadAdapter(c) {
  if (!c.adapter) return {};
  const mod = await import(pathToFileURL(c.adapter).href);
  if (typeof mod.init === "function") await mod.init(c);
  return mod;
}

/**
 * Load the scenes list. A .mjs module exports SCENES (or TAKES) = [{ n, name, run, ... }]; a .json
 * file holds [{ name, start?, steps }] or { scenes: [...] }. A scene with `steps` and no `run` is
 * declarative (takes/steps.mjs). Modules are cache-busted on request (`fresh`).
 */
export async function loadScenes(c, { fresh = false } = {}) {
  let list;
  if (c.scenes.endsWith(".json")) {
    const j = JSON.parse(fs.readFileSync(c.scenes, "utf8"));
    list = Array.isArray(j) ? j : j.scenes;
  } else {
    const mod = await import(pathToFileURL(c.scenes).href + (fresh ? `?v=${Date.now()}` : ""));
    list = mod.SCENES ?? mod.TAKES ?? mod.default;
  }
  if (!Array.isArray(list)) throw new Error(`${c.scenes}: export SCENES as an array (or a JSON array of scenes)`);
  const { sceneFromSteps } = await import("./takes/steps.mjs");
  return list.map((s0, i) => {
    const s = typeof s0.run !== "function" && Array.isArray(s0.steps) ? sceneFromSteps(s0) : s0;
    if (typeof s.run !== "function") throw new Error(`scene ${i + 1}: run(take, ctx) or steps [...] is required`);
    if (!s.name) throw new Error(`scene ${i + 1}: name is required (it becomes the take folder name)`);
    s.n ??= i + 1;
    return s;
  });
}

/** Minimal flag parser: --key value, --flag (boolean), positional rest. */
export function parseArgs(argv, booleans = []) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) {
      rest.push(a);
      continue;
    }
    const [k, inline] = a.slice(2).split("=", 2);
    if (inline !== undefined) flags[k] = inline;
    else if (booleans.includes(k)) flags[k] = true;
    else flags[k] = argv[++i];
  }
  return { flags, rest };
}
