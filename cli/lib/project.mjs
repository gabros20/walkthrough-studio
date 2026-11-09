// Project resolution and loading for the CLI.
//
// A project is one folder per film (docs/DESIGN-batch-2.md §1): walkthrough.config.mjs, scenes,
// brand.json, storyboard.json, takes/, renders/, state.json. It is found, first match wins:
// --project <dir>, WALKTHROUGH_PROJECT, else the nearest ancestor of the current directory (itself
// included) holding walkthrough.config.mjs or state.json.
//
//   KIT_ROOT                               the kit's root folder (this file is <kit>/cli/lib/)
//   kitPath(...parts) -> absolute path inside the kit
//   insideKit(path) -> boolean             projects never live in the kit (ADR-007)
//   findProjectDir({ explicit, env, cwd }) -> { dir, source } | null
//   loadProject(dir) -> project            see below; never throws for a broken config file
//                                          (project.configError is set and config is {})
//   requireProject(ctx) -> project         throws CliError with the standard hint when there is none
//   resolvedConfig(project) -> Promise<config | null>
//                                          the recorder's resolved config (recorder/config.mjs
//                                          loadConfig: defaults, env, absolute paths), cached
//   takesDirOf(project) -> Promise<dir>    resolved config takesDir, else <project>/takes
//   CliError(message, code = 1)            an expected failure: printed without a stack
//
// project = {
//   dir, name, configFile (path | null), config (the config file's default export, or {}),
//   configError (Error | null), state (always an object; state.json is created on first save()),
//   hasStateFile, save(), paths: { config, state, storyboard, takes, renders }
// }
import { existsSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { emptyState, readState, STATE_FILE, writeState } from "./state.mjs";

export const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const CONFIG_FILE = "walkthrough.config.mjs";
export const kitPath = (...parts) => join(KIT_ROOT, ...parts);
export const insideKit = (p) => {
  const a = resolve(p);
  return a === KIT_ROOT || a.startsWith(KIT_ROOT + "/");
};

export class CliError extends Error {
  constructor(message, code = 1) {
    super(message);
    this.code = code;
  }
}

const isProjectDir = (d) => existsSync(join(d, CONFIG_FILE)) || existsSync(join(d, STATE_FILE));

export function findProjectDir({ explicit, env = process.env, cwd = process.cwd() } = {}) {
  if (explicit) {
    const d = resolve(explicit);
    if (!existsSync(d) || !statSync(d).isDirectory()) throw new CliError(`--project ${explicit}: no such folder`, 2);
    return { dir: d, source: "--project" };
  }
  if (env.WALKTHROUGH_PROJECT) {
    const d = resolve(env.WALKTHROUGH_PROJECT);
    if (!existsSync(d) || !statSync(d).isDirectory()) throw new CliError(`WALKTHROUGH_PROJECT=${env.WALKTHROUGH_PROJECT}: no such folder`, 2);
    return { dir: d, source: "WALKTHROUGH_PROJECT" };
  }
  let d = resolve(cwd);
  for (;;) {
    if (isProjectDir(d)) return { dir: d, source: d === resolve(cwd) ? "current directory" : "parent directory" };
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

export async function loadProject(dir) {
  dir = resolve(dir);
  const configFile = existsSync(join(dir, CONFIG_FILE)) ? join(dir, CONFIG_FILE) : null;
  let config = {};
  let configError = null;
  if (configFile) {
    try {
      const mod = await import(pathToFileURL(configFile).href);
      const raw = typeof mod.default === "function" ? await mod.default() : (mod.default ?? mod.config ?? {});
      config = raw && typeof raw === "object" ? raw : {};
    } catch (err) {
      configError = err;
    }
  }
  const fromFile = readState(dir);
  const state = fromFile ?? emptyState({ name: config.name ?? basename(dir), mode: config.studio ? "studio" : configFile ? "site" : null });
  const project = {
    dir,
    name: state.name ?? config.name ?? basename(dir),
    configFile,
    config,
    configError,
    state,
    hasStateFile: Boolean(fromFile),
    save() {
      writeState(dir, project.state);
      project.hasStateFile = true;
    },
    paths: {
      config: join(dir, CONFIG_FILE),
      state: join(dir, STATE_FILE),
      storyboard: join(dir, "storyboard.json"),
      takes: join(dir, "takes"),
      renders: join(dir, "renders"),
    },
  };
  return project;
}

export function requireProject(ctx) {
  if (ctx.project) return ctx.project;
  throw new CliError(
    "no project here: run inside a project folder (one with walkthrough.config.mjs or state.json), pass --project <dir>, set WALKTHROUGH_PROJECT, or make one with `walkthrough init <dir>`",
    2,
  );
}

const resolvedCache = new Map();
export async function resolvedConfig(project) {
  if (!project?.configFile || project.configError) return null;
  if (resolvedCache.has(project.dir)) return resolvedCache.get(project.dir);
  const { loadConfig } = await import(pathToFileURL(kitPath("recorder/config.mjs")).href);
  let c = null;
  try {
    c = await loadConfig(project.configFile);
  } catch (err) {
    project.configError ??= err;
  }
  resolvedCache.set(project.dir, c);
  return c;
}

export async function takesDirOf(project) {
  const c = await resolvedConfig(project);
  return c?.takesDir ?? project.paths.takes;
}
