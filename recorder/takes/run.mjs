// Take runner: records a project's scenes in ONE browser session, in story order, and after each
// take pauses until a go file says what to do next, so every take can be read back (status JSON,
// contact sheet) before the story moves on.
//
//   node recorder/takes/run.mjs --config <walkthrough.config.mjs> [scene ...] [options]
//
// Scenes are picked by number (`n`) or name; without any, --from/--to select a range by `n`.
// Options (each also has a config key; flags win over env, env wins over the config file):
//   --from N --to N        range of scene numbers (default: all)
//   --auto                 do not wait for go files: continue while takes pass, stop on the first
//                          failure; checkpoint after a take when the scene names one
//   --fresh                start with an empty ctx even when resuming mid-story
//   --base-url URL         WALKTHROUGH_BASE_URL
//   --takes DIR            WALKTHROUGH_TAKES
//   --storage FILE         WALKTHROUGH_STORAGE (Playwright storage state: cookies, localStorage)
//   --mode new|shell|headed  WALKTHROUGH_MODE
//   --viewport desktop|phone WALKTHROUGH_VIEWPORT
//   --studio-config FILE   STUDIO_CONFIG (studio.config.sh for checkpoint/restore)
//
// After take N it writes <runnerDir>/status-N.json and <take>/verify/sheet.jpg, then waits for
// <runnerDir>/go-N.json (runnerDir defaults to <takesDir>/_runner):
//   {"action":"next","checkpoint":"CP2"}   checkpoint (optional), then continue
//   {"action":"redo","restore":"CP1"}      restore the checkpoint (optional), reload, record take N again
//   {"action":"stop","checkpoint":"CP3"}   checkpoint (optional) and exit
// Values decided between takes can be put in <runnerDir>/ctx-override.json; they are merged into
// ctx before each take. The scenes module is re-imported before each take, so a script fix needs
// no restart.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadAdapter, loadConfig, loadScenes, parseArgs, sessionOptions } from "../config.mjs";
import { openSession } from "../take.mjs";
import { guardKeys } from "./lib.mjs";
import { contactSheet, uniqueFps } from "./report.mjs";

const { flags, rest } = parseArgs(process.argv.slice(2), ["auto", "fresh"]);
if (!flags.config) {
  console.error("usage: run.mjs --config <walkthrough.config.mjs> [scene ...] [--from N] [--to N] [--auto] [--fresh]");
  process.exit(2);
}
const config = await loadConfig(flags.config, {
  baseUrl: flags["base-url"],
  takesDir: flags.takes,
  storageState: flags.storage,
  "session.mode": flags.mode,
  viewport: flags.viewport,
  "studio.config": flags["studio-config"],
});
const adapter = await loadAdapter(config);
const all = await loadScenes(config);
const pick = (id) => all.find((s) => String(s.n) === String(id) || s.name === id) ?? (() => { throw new Error(`no scene "${id}"`); })();
const from = Number(flags.from ?? -Infinity);
const to = Number(flags.to ?? Infinity);
const selected = rest.length ? rest.map(pick) : all.filter((s) => s.n >= from && s.n <= to);
if (!selected.length) throw new Error("no scenes selected");

const CTRL = config.runnerDir;
fs.mkdirSync(CTRL, { recursive: true });
const ctxFile = path.join(CTRL, "ctx.json");
const resuming = selected[0] !== all[0];
const ctx = resuming && !flags.fresh && fs.existsSync(ctxFile) ? JSON.parse(fs.readFileSync(ctxFile, "utf8")) : { results: {}, turns: 0 };
ctx.results ??= {};
// The config travels with ctx but is not written to ctx.json.
Object.defineProperty(ctx, "config", { value: config, enumerable: false });
const saveCtx = (file) => fs.writeFileSync(file, `${JSON.stringify(ctx, null, 2)}\n`);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---- studio (optional): checkpoint / restore the app's data between takes
function studio(script, arg) {
  if (!config.studio?.bin) throw new Error(`no studio configured; cannot run ${script} ${arg}`);
  const env = { ...process.env, ...(config.studio.config ? { STUDIO_CONFIG: config.studio.config } : {}) };
  return execFileSync(path.join(config.studio.bin, `${script}.sh`), arg ? [arg] : [], { encoding: "utf8", env }).trim();
}
let checkpointsDir = config.studio?.checkpointsDir ?? null;
if (config.studio?.bin && !checkpointsDir) {
  const m = studio("paths").match(/^STUDIO_CHECKPOINTS=(.*)$/m);
  checkpointsDir = m?.[1] ?? null;
}

// ---- session
const session = await openSession(sessionOptions(config));
session.adapter = adapter;
session.config = config;
if (adapter.setupSession) await adapter.setupSession(session, config);

async function reload() {
  if (adapter.reload) return session.offCamera(() => adapter.reload(session, config));
  return session.offCamera((page) => page.goto(`${config.baseUrl}${config.reload.path}`).then(() => page.waitForTimeout(config.reload.settleMs)));
}
const prepareTake = (take) => (adapter.prepareTake ? adapter.prepareTake(take, config) : guardKeys(take, adapter.forbiddenKeys ?? ["Enter", "Escape"]));

if (resuming) await reload();

async function waitGo(n, def, ok) {
  if (flags.auto) return ok ? { action: "next", checkpoint: def.checkpoint && checkpointsDir ? def.checkpoint : undefined } : { action: "stop" };
  const f = path.join(CTRL, `go-${n}.json`);
  log(`take ${n}: waiting for ${f}`);
  while (!fs.existsSync(f)) await new Promise((r) => setTimeout(r, 1000));
  const go = JSON.parse(fs.readFileSync(f, "utf8"));
  fs.renameSync(f, path.join(CTRL, `go-${n}.done-${Date.now()}.json`));
  return go;
}

async function redo(go) {
  if (go.restore) {
    log(studio("restore", go.restore));
    const st = checkpointsDir && path.join(checkpointsDir, go.restore, "ctx.json");
    if (st && fs.existsSync(st)) Object.assign(ctx, JSON.parse(fs.readFileSync(st, "utf8")));
  }
  await reload();
}

async function checkpoint(name) {
  log(studio("checkpoint", name));
  if (!checkpointsDir) return;
  fs.mkdirSync(path.join(checkpointsDir, name), { recursive: true });
  await session.context.storageState({ path: path.join(checkpointsDir, name, "storage.json") });
  saveCtx(path.join(checkpointsDir, name, "ctx.json"));
}

let exitCode = 0;
outer: for (const sel of selected) {
  for (;;) {
    // Re-import the scene definitions for every take, so a fix between takes needs no restart.
    const def = (await loadScenes(config, { fresh: true }).catch(() => all)).find((s) => s.name === sel.name) ?? sel;
    log(`take ${def.n} ${def.name}: start`);
    const ov = path.join(CTRL, "ctx-override.json");
    if (fs.existsSync(ov)) Object.assign(ctx, JSON.parse(fs.readFileSync(ov, "utf8")));
    if (def.pre) await def.pre(session, ctx);
    const take = prepareTake(await session.startTake(def.name, { overwrite: true, fps: config.fps }));
    let error = null;
    try {
      await def.run(take, ctx);
    } catch (err) {
      error = String(err?.stack ?? err);
      log(`take ${def.n} failed: ${err?.message}`);
    }
    let summary;
    try {
      summary = await take.finish(config.finish);
    } catch (err) {
      const msg = String(err?.stack ?? err);
      log(`take ${def.n}: finish failed: ${err?.message}`);
      session.take = null;
      fs.writeFileSync(path.join(CTRL, `status-${def.n}.json`), `${JSON.stringify({ n: def.n, name: def.name, ok: false, error: error ?? msg, finishError: msg, turnsSoFar: ctx.turns }, null, 2)}\n`);
      const go = await waitGo(def.n, def, false);
      if (go.action === "redo") {
        await redo(go);
        continue;
      }
      exitCode = 1;
      break outer;
    }
    let truth = null;
    if (!error && def.truth) {
      try {
        truth = await def.truth(session, ctx, take);
      } catch (err) {
        truth = { error: String(err?.message ?? err) };
      }
    }
    fs.writeFileSync(path.join(take.dir, "truth.json"), `${JSON.stringify(truth, null, 2)}\n`);
    try {
      summary.uniqueFps = uniqueFps(take.dir);
      const tj = path.join(take.dir, "take.json");
      fs.writeFileSync(tj, `${JSON.stringify({ ...JSON.parse(fs.readFileSync(tj, "utf8")), uniqueFps: summary.uniqueFps }, null, 2)}\n`);
    } catch (err) {
      log(`uniqueFps: ${err.message}`);
    }
    const sheet = contactSheet(take.dir);
    const ok = !error && summary.masterSync.pass && summary.gaps.outsideWaits.ms <= config.gate.maxGapMs;
    const status = {
      n: def.n,
      name: def.name,
      ok,
      error,
      duration: summary.master.duration,
      sync: summary.sync,
      masterSync: summary.masterSync,
      gaps: summary.gaps,
      warnings: summary.warnings,
      truth,
      turnsSoFar: ctx.turns,
      results: ctx.results,
      uniqueFps: summary.uniqueFps,
      sheet: sheet.sheet,
    };
    fs.writeFileSync(path.join(CTRL, `status-${def.n}.json`), `${JSON.stringify(status, null, 2)}\n`);
    saveCtx(ctxFile);
    log(`take ${def.n}: ok=${ok} sync=${summary.masterSync.pass} gapOut=${summary.gaps.outsideWaits.ms}ms -> ${take.dir}`);
    const go = await waitGo(def.n, def, ok);
    if (go.action === "redo") {
      log(`take ${def.n}: redo${go.restore ? ` from ${go.restore}` : ""}`);
      await redo(go);
      continue;
    }
    if (go.checkpoint) await checkpoint(go.checkpoint);
    if (go.action === "stop") {
      exitCode = ok ? 0 : 1;
      break outer;
    }
    break;
  }
}
if (exitCode === 0) log("done");
await session.close();
process.exit(exitCode);
