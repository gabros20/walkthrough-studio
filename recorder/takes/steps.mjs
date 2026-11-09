// Declarative scenes: a take written as a list of steps, so a website or app needs no adapter or
// scene code. Used by the runner for scenes that have `steps` instead of `run`, including scenes
// loaded from a .json file.
//
// A target is a CSS selector string or { role, name } / { text } / { label } / { placeholder } /
// { testId } / { selector } (see locate() in take.mjs). Every step that logs needs a `label`.
//
//   { "click": T, "label": "sign in", "at": { "x": 0.3, "y": 0.5 } }
//   { "type": "hello", "into": T, "label": "search text" }   click T first (label "<label> field"),
//                                                              or type into the focused field
//   { "hover": T, "label": "pricing card", "hold": 0.8 }
//   { "scroll": { "dy": 600, "at": T }, "label": "to features" }
//   { "reveal": T, "label": "to footer" }                      wheel-scroll T into view if needed
//   { "safe": T, "label": "card 3 safe" }                      scrollIntoViewSafe
//   { "mark": T, "label": "hero headline" }
//   { "wait": "quiet", "label": "results" }                    waitQuiet with defaults
//   { "wait": { "quiet": { "ms": 1200, "timeout": 20000 } }, "label": "results" }
//   { "wait": { "visible": T } | { "hidden": T } | { "url": "/done" }, "label": "dialog" }
//   { "hold": 0.8 }
//   { "nav": "/pricing", "label": "pricing page" }             relative to baseUrl
//   { "press": "Tab", "label": "next field" }                  refused for keys in forbiddenKeys
//   { "park": true, "label": "after search park" }             rest the mouse where nothing hovers
import { locate } from "../take.mjs";
import { park } from "./lib.mjs";

const abs = (base, url) => (/^[a-z]+:/i.test(url) ? url : `${base ?? ""}${url}`);

/** Run one step on a take. */
export async function runStep(take, step) {
  const { label } = step;
  const page = take.page;
  const base = take.session.config?.baseUrl;
  // Downloads and dialogs that this step causes are logged under its label.
  if (label) take.currentLabel = label;
  if (step.click !== undefined) return take.click(step.click, { label, at: step.at, count: step.count });
  if (step.type !== undefined) {
    if (step.into !== undefined) await take.click(step.into, { label: `${label} field`, at: step.at ?? { x: 0.25, y: 0.5 } });
    return take.type(String(step.type), { label, cps: step.cps, seed: step.seed, method: step.method ?? "insert" });
  }
  if (step.hover !== undefined) return take.hover(step.hover, { label, at: step.at, hold: step.hold ?? 0.6 });
  if (step.scroll !== undefined) return take.scroll({ dx: step.scroll.dx ?? 0, dy: step.scroll.dy ?? 0, at: step.scroll.at, duration: step.scroll.duration, label });
  if (step.reveal !== undefined) return take.reveal(step.reveal, { label, align: step.align });
  if (step.safe !== undefined) return take.scrollIntoViewSafe(step.safe, { label, marginTop: step.marginTop, marginBottom: step.marginBottom });
  if (step.mark !== undefined) return take.mark(label, step.mark);
  if (step.wait !== undefined) {
    const w = step.wait;
    if (w === "quiet") return take.waitQuiet(label);
    if (w.quiet) return take.waitQuiet(label, w.quiet === true ? {} : w.quiet);
    if (w.visible !== undefined) return take.wait(label, () => locate(page, w.visible).waitFor({ state: "visible", timeout: w.timeout ?? 30_000 }).then(() => "visible"));
    if (w.hidden !== undefined) return take.wait(label, () => locate(page, w.hidden).waitFor({ state: "hidden", timeout: w.timeout ?? 30_000 }).then(() => "hidden"));
    if (w.url !== undefined) return take.wait(label, () => page.waitForURL((u) => u.href.includes(w.url), { timeout: w.timeout ?? 30_000 }).then(() => "reached"));
    throw new Error(`wait step needs "quiet", { quiet }, { visible }, { hidden } or { url }: ${JSON.stringify(step)}`);
  }
  if (step.hold !== undefined) return take.hold(Number(step.hold));
  if (step.nav !== undefined) return take.nav(abs(base, step.nav), { label });
  if (step.press !== undefined) return take.press(step.press, { label });
  if (step.park) return park(take, label);
  throw new Error(`unknown step ${JSON.stringify(step)}`);
}

/** Run a list of steps in order. */
export async function runSteps(take, steps) {
  for (const step of steps) await runStep(take, step);
}

/**
 * Turn a declarative scene ({ name, start?, steps, pointer? }) into a runner scene. `start` is a
 * path (relative to baseUrl) or URL opened off camera before the take; `pointer` is where the mouse
 * waits at the start ({ x, y }, default: wherever it was).
 */
export function sceneFromSteps(def) {
  const scene = { ...def };
  scene.run = (take) => runSteps(take, def.steps);
  if (!def.pre && (def.start !== undefined || def.pointer)) {
    scene.pre = async (session) => {
      if (def.start !== undefined)
        await session.offCamera(async (page) => {
          await page.goto(abs(session.config?.baseUrl, def.start));
          await page.waitForTimeout(def.settleMs ?? 1500);
        });
      if (def.pointer) {
        session.pointer = { ...def.pointer };
        await session.page.mouse.move(def.pointer.x, def.pointer.y);
      }
    };
  }
  return scene;
}
