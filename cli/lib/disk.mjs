// Disk policy for long steps (render, sound, deliver): docs/DESIGN-batch-2.md §4, docs/CLI.md.
//
// Before the step: if the project volume has at least `needBytes` free (5 GB by default), work
// locally. Otherwise, if a buffer folder is configured (walkthrough.config.mjs `buffer`, or
// WALKTHROUGH_BUFFER) and its volume is mounted with room, the step's scratch files and output go to
// <buffer>/<project name>/<step>/ and the caller copies the final file back ("spill"). If neither
// has room, stop before the step and say how much is needed. On macOS long steps run under
// `caffeinate -i` (the Mac does not sleep mid-render).
//
//   GB, MIN_FREE_BYTES (5 GB), WARN_FREE_BYTES (10 GB)
//   freeBytes(path) -> { free, mount } | null       `df -k -P` on the path (or its nearest existing parent)
//   bufferOf(project) -> absolute buffer path | null
//   planDisk({ projectDir, projectName, buffer, step, needBytes }) -> plan
//     plan = { action: "local" | "spill" | "stop", step, needBytes, projectFree, bufferFree,
//              buffer, workDir (spill only), message }
//   diskPolicy(ctx, { step, needBytes }) -> plan    plans for ctx.project, prints the decision,
//                                                   records a spill in state.spills (the caller
//                                                   saves), throws CliError on "stop"
//   spillEnv(plan) -> env for a spilled HyperFrames render (TMPDIR and HYPERFRAMES_EXTRACT_CACHE_DIR
//                     inside workDir) or {}
//   withCaffeinate(cmd, args) -> { cmd, args, caffeinated }   wraps on darwin when caffeinate exists
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { capture, which } from "./exec.mjs";
import { CliError } from "./project.mjs";
import { now } from "./state.mjs";
import { fmtBytes } from "./table.mjs";

export const GB = 1024 ** 3;
export const MIN_FREE_BYTES = 5 * GB;
export const WARN_FREE_BYTES = 10 * GB;

export function freeBytes(path) {
  let p = resolve(path);
  while (!existsSync(p)) {
    const up = dirname(p);
    if (up === p) return null;
    p = up;
  }
  const r = capture("df", ["-k", "-P", p], { timeout: 10_000 });
  if (r.code !== 0) return null;
  const line = r.stdout.trim().split("\n").at(-1).trim().split(/\s+/);
  const kb = Number(line[3]);
  return Number.isFinite(kb) ? { free: kb * 1024, mount: line.slice(5).join(" ") } : null;
}

export function bufferOf(project) {
  const b = process.env.WALKTHROUGH_BUFFER || project?.config?.buffer;
  if (!b) return null;
  return isAbsolute(b) ? b : resolve(project.dir, b);
}

/** A buffer counts as mounted when it, or its parent folder, exists (an unmounted /Volumes/X does not). */
const bufferMounted = (b) => Boolean(b) && (existsSync(b) || existsSync(dirname(b)));

export function planDisk({ projectDir, projectName, buffer = null, step, needBytes = MIN_FREE_BYTES }) {
  const p = freeBytes(projectDir);
  const projectFree = p?.free ?? null;
  const mounted = bufferMounted(buffer);
  const bufferFree = mounted ? (freeBytes(buffer)?.free ?? null) : null;
  const base = { step, needBytes, projectFree, bufferFree, buffer };
  if (projectFree === null || projectFree >= needBytes)
    return { ...base, action: "local", message: `disk: ${projectFree === null ? "free space unknown" : `${fmtBytes(projectFree)} free`} on the project volume (need ${fmtBytes(needBytes)}): working locally` };
  if (mounted && bufferFree !== null && bufferFree >= needBytes) {
    const workDir = join(buffer, projectName, step);
    return { ...base, action: "spill", workDir, message: `disk: only ${fmtBytes(projectFree)} free on the project volume (need ${fmtBytes(needBytes)}); ${step} works in ${workDir} (${fmtBytes(bufferFree)} free) and copies the result back` };
  }
  const bufNote = !buffer ? "no buffer configured (walkthrough.config.mjs `buffer` or WALKTHROUGH_BUFFER)" : !mounted ? `buffer ${buffer} is not mounted` : `buffer ${buffer} has ${fmtBytes(bufferFree)} free`;
  return { ...base, action: "stop", message: `disk: ${step} needs ${fmtBytes(needBytes)} free; the project volume has ${fmtBytes(projectFree)} and ${bufNote}. Free ${fmtBytes(needBytes - projectFree)} on the project volume, or mount/configure a buffer with room.` };
}

export function diskPolicy(ctx, { step, needBytes = MIN_FREE_BYTES } = {}) {
  const project = ctx.project;
  const plan = planDisk({ projectDir: project.dir, projectName: project.name, buffer: bufferOf(project), step, needBytes });
  if (plan.action === "stop") throw new CliError(plan.message);
  ctx.log.info(plan.message);
  if (plan.action === "spill") {
    mkdirSync(plan.workDir, { recursive: true });
    project.state.spills ??= [];
    project.state.spills.push({ at: now(), step, from: project.dir, to: plan.workDir, projectFree: plan.projectFree, bufferFree: plan.bufferFree });
  }
  return plan;
}

export function spillEnv(plan) {
  if (plan?.action !== "spill") return {};
  const tmp = join(plan.workDir, "tmp");
  const cache = join(plan.workDir, "extract-cache");
  mkdirSync(tmp, { recursive: true });
  mkdirSync(cache, { recursive: true });
  return { TMPDIR: tmp, HYPERFRAMES_EXTRACT_CACHE_DIR: cache };
}

export function withCaffeinate(cmd, args) {
  if (process.platform === "darwin" && !process.env.WALKTHROUGH_NO_CAFFEINATE) {
    const c = which("caffeinate");
    if (c) return { cmd: "caffeinate", args: ["-i", cmd, ...args], caffeinated: true };
  }
  return { cmd, args, caffeinated: false };
}
