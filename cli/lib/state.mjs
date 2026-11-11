// The project's state file, state.json (schema "walkthrough-state/1"). The CLI owns it: commands
// read and change ctx.project.state and call ctx.project.save(); the kit's tools never write it.
// Unknown keys are kept, so a command can add its own section (create it with `??=`).
//
// {
//   schema: "walkthrough-state/1", name, mode: "site" | "studio" | null, createdAt, updatedAt,
//   takes: { <take name>: { recordedAt, ok, accepted, checkpoint, duration, masterSync,
//                           gaps: { outsideWaitsMs, insideWaitsMs }, warnings, uniqueFps, dir } },
//   checkpoints: [ { name, at, by } ],  currentCheckpoint: { name, at } | null,
//   pictureLock: { hash, at } | null,
//   builds:  [ { at, dry, storyboardHash, captions, aspect, brand: { file, hash } | null, takes,
//                fitAudio: { file, hash, gap, max } | null, audit: { errors, warnings } | null, exit } ],
//            (aspect, brand, takes, fitAudio: the build's resolved inputs; render compares them)
//   lastAudit: { at, errors, warnings, exit } | null,
//   renders: [ { name, file, at, fps, duration, captions, storyboardHash, seconds, spill } ],
//   sound: [...], voiceover: [...], deliveries: [...],     (written by the sound / vo / deliver commands)
//   tourMap: { at, startUrl, pages, controls, skipped, file } | null,          (explore)
//   captions: { briefAt, appliedAt, count, applied } | null,                   (captions brief / apply)
//   reviews: [ { render, out, at, audit: { errors, warnings } | null, holds, labels } ],   (review)
//   spills: [ { at, step, from, to, projectFree, bufferFree } ],
//   costs: [ { at, kind, units, amount, note } ],
//   cleanups: [ { at, by, all, keepCheckpoints, keepTakes, removed, failed, refused, logical,
//                 freedBytes, measuredBytes, items } ],                          (clean, studio prune)
//   doctor: { at, fails, warns } | null
// }
//
//   STATE_SCHEMA, STATE_FILE, COST_KINDS
//   emptyState({ name, mode }) -> state
//   normalizeState(obj) -> state      fills missing sections (in place), checks the schema id
//   readState(dir) -> state | null     null when the project has no state.json yet
//   writeState(dir, state)             atomic (temp file + rename); sets updatedAt
//   addCost(state, { kind, units, amount, note }) -> row   validates kind and numbers
//   sha256File(path) -> hex | null
//   rel(dir, path) -> path relative to the project (for storing in state)
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export const STATE_SCHEMA = "walkthrough-state/1";
export const STATE_FILE = "state.json";
export const COST_KINDS = ["tts", "music", "agent", "render", "other"];

const SECTIONS = {
  takes: () => ({}),
  checkpoints: () => [],
  currentCheckpoint: () => null,
  pictureLock: () => null,
  builds: () => [],
  lastAudit: () => null,
  renders: () => [],
  sound: () => [],
  voiceover: () => [],
  deliveries: () => [],
  tourMap: () => null,
  captions: () => null,
  reviews: () => [],
  spills: () => [],
  costs: () => [],
  cleanups: () => [],
  doctor: () => null,
};

export const now = () => new Date().toISOString();

export function emptyState({ name = null, mode = null } = {}) {
  const at = now();
  return normalizeState({ schema: STATE_SCHEMA, name, mode, createdAt: at, updatedAt: at });
}

export function normalizeState(s) {
  if (!s || typeof s !== "object" || Array.isArray(s)) throw new Error("state.json: expected an object");
  if (s.schema && s.schema !== STATE_SCHEMA) throw new Error(`state.json: schema "${s.schema}" is not ${STATE_SCHEMA}`);
  s.schema = STATE_SCHEMA;
  s.name ??= null;
  s.mode ??= null;
  for (const [k, make] of Object.entries(SECTIONS)) if (s[k] === undefined) s[k] = make();
  return s;
}

export function readState(dir) {
  const p = join(dir, STATE_FILE);
  if (!existsSync(p)) return null;
  return normalizeState(JSON.parse(readFileSync(p, "utf8")));
}

export function writeState(dir, state) {
  normalizeState(state);
  state.createdAt ??= now();
  state.updatedAt = now();
  const p = join(dir, STATE_FILE);
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
  renameSync(tmp, p);
  return p;
}

export function addCost(state, { kind, units, amount = null, note = null, at = now() }) {
  if (!COST_KINDS.includes(kind)) throw new Error(`cost kind must be one of ${COST_KINDS.join(", ")} (got "${kind}")`);
  const u = Number(units);
  if (!Number.isFinite(u)) throw new Error(`cost units must be a number (got "${units}")`);
  const a = amount === null || amount === undefined ? null : Number(amount);
  if (a !== null && !Number.isFinite(a)) throw new Error(`cost amount must be a number (got "${amount}")`);
  const row = { at, kind, units: u, amount: a, note: note ?? null };
  normalizeState(state).costs.push(row);
  return row;
}

export function sha256File(path) {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function rel(dir, path) {
  const r = relative(dir, path);
  return r.startsWith("..") ? path : r || ".";
}
