// Audit a built film for the faults a viewer notices, from the written edl.json / cues.json /
// captions.srt, the storyboard and the takes' event logs:
//
//   holds     static stretches longer than --hold s (scripts/holds.py: no pointer move, no tween,
//             no UI change in the cut clip); needs a real build (compositions + clips) and numpy
//   jumps     the pointer jumping at a cut: at a hard cut between scenes, and where a scene's ranges
//             are not contiguous, the distance between where the mouse was before and after, in
//             stage px at wide framing; cuts treated by pointer.enterFrom / pointer.exit, a push or
//             a whip, or a hidden pointer are listed as treated
//   dead air  a caption that ends before the next cut, after which nothing logged happens (no
//             move, click, typing, scroll, time-lapse) for more than --tail s before that cut
//   captions  caption lint: words, hold, overlap (overlap is an error)
//   claims    a caption with "claims": "mark:<label>" whose quoted phrase ("…") is not in that
//             mark's logged text (an error: the caption says something the screen does not)
//
//   node <kit>/film/scripts/audit.mjs [storyboard.json] [--project dir] [--takes dir] [--edl f] [--cues f] [--srt f]
//                          [--hold 1.0] [--jump 120] [--tail 1.0] [--no-holds] [--json]
//
// Defaults read <project>/edl.json, cues.json and captions.srt (what build.mjs last wrote; the
// project as in lib/config.mjs, or --project). Prints one
// table; exit 1 when there is an error, 0 with warnings only. `node build.mjs --audit` runs it
// after the build (after a --dry build on the would-be files, without the holds check).

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { FILM_DIR, K, PROJECT_DIR } from "../lib/config.mjs";
import { checkTakeSchema, eventText, findRef } from "../lib/edl.mjs";
import { lintCaptions } from "../lib/captions.mjs";
import { pointerAt } from "../../recorder/motion.mjs";

const argv = process.argv.slice(2);
const VALUED = ["--takes", "--edl", "--cues", "--srt", "--hold", "--jump", "--tail", "--brand", "--project"];
const opt = (name, def = null) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const positional = argv.filter((a, i) => !a.startsWith("--") && !VALUED.includes(argv[i - 1]));
const sbPath = resolve(positional.find((a) => a.endsWith(".json")) ?? join(PROJECT_DIR, "storyboard.json"));
const sb = JSON.parse(readFileSync(sbPath, "utf8"));
const takesDir = opt("takes") ? resolve(opt("takes")) : process.env.WALKTHROUGH_TAKES ? resolve(process.env.WALKTHROUGH_TAKES)
  : sb.takesDir ? (isAbsolute(sb.takesDir) ? sb.takesDir : resolve(dirname(sbPath), sb.takesDir)) : (existsSync(join(PROJECT_DIR, "takes")) ? join(PROJECT_DIR, "takes") : resolve(PROJECT_DIR, "../takes"));
const edlPath = resolve(opt("edl") ?? join(PROJECT_DIR, "edl.json"));
const cuesPath = resolve(opt("cues") ?? join(PROJECT_DIR, "cues.json"));
const srtPath = resolve(opt("srt") ?? join(PROJECT_DIR, "captions.srt"));
const HOLD = Number(opt("hold", 1.0)), JUMP = Number(opt("jump", 120)), TAIL = Number(opt("tail", 1.0));

const rows = [];
const add = (level, check, scene, film, detail) => rows.push({ level, check, scene: scene ?? "", film: film == null ? "" : film.toFixed(2), detail });

for (const p of [edlPath, cuesPath]) if (!existsSync(p)) { console.error(`audit: ${p} not found: build first (node build.mjs, or --dry --dry-out <dir>)`); process.exit(1); }
const edl = JSON.parse(readFileSync(edlPath, "utf8"));
const cues = JSON.parse(readFileSync(cuesPath, "utf8"));
const FPS = edl.fps ?? cues.fps ?? 30;

// ---------- takes ----------
const takes = new Map();
function take(name) {
  if (!takes.has(name)) {
    const dir = join(takesDir, name);
    const ev = checkTakeSchema(JSON.parse(readFileSync(join(dir, "events.json"), "utf8")), name);
    const tj = existsSync(join(dir, "take.json")) ? JSON.parse(readFileSync(join(dir, "take.json"), "utf8")) : {};
    takes.set(name, { ...ev, keep: tj.sync?.keep ?? null });
  }
  return takes.get(name);
}
const sbScene = new Map(sb.scenes.map((s) => [s.id, s]));
const scenes = edl.scenes.map((s) => ({ ...s, sb: sbScene.get(s.id) }));
for (const s of scenes) if (!s.sb) add("error", "edl", s.id, s.start, "scene is in edl.json but not in the storyboard: the edl is from another build");

// ---------- jumps ----------
const at = (s, src) => pointerAt(take(s.sb.take).events, src, take(s.sb.take).pointerStart);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * K;
for (let i = 0; i < scenes.length; i++) {
  const s = scenes[i];
  if (!s.sb) continue;
  const hidden = s.sb.pointer?.show === false;
  // inside a scene: ranges that do not follow on in the source (excised spans are cuts too, but the
  // pointer rests across them, so they measure ~0)
  for (let k = 1; k < s.ranges.length; k++) {
    const a = s.ranges[k - 1], b = s.ranges[k];
    if (Math.abs(a.srcOut - b.srcIn) < 1e-6 || hidden) continue;
    const d = dist(at(s, a.srcOut), at(s, b.srcIn));
    // a montage cuts on every beat by design: its slices are one beat long
    const beat = sb.music?.beat ?? 0.625;
    const montage = s.sb.ranges.some((r) => r.montage) && Math.min(a.filmDur, b.filmDur) <= beat + 1.5 / FPS;
    if (d > JUMP) add(montage ? "ok" : "warn", "jump", s.id, s.start + b.filmIn, `pointer jumps ${Math.round(d)} px at a cut inside the scene (source ${a.srcOut.toFixed(2)} -> ${b.srcIn.toFixed(2)} s)${montage ? " (montage slice)" : ""}`);
  }
  if (i === 0) continue;
  const p = scenes[i - 1];
  if (!p.sb) continue;
  const last = p.ranges[p.ranges.length - 1], first = s.ranges[0];
  // the source second at the previous scene's last frame (a push ends the scene early)
  const pEnd = last.srcIn + Math.max(0, p.duration - last.filmIn) * last.rate;
  const d = dist(at(p, Math.min(pEnd, last.srcOut)), at(s, first.srcIn));
  const treated =
    p.exit === "push" ? "push" : p.exit === "whip" ? "whip"
    : s.sb.pointer?.enterFrom ? "enterFrom" : p.sb.pointer?.exit ? "exit"
    : hidden || p.sb.pointer?.show === false ? "hidden" : p.sb.pointer?.hideAt ? "hideAt" : s.sb.pointer?.showAt ? "showAt" : null;
  if (d > JUMP) add(treated ? "ok" : "warn", "jump", s.id, s.start, `${p.id} -> ${s.id}: pointer ${Math.round(d)} px apart${treated ? ` (treated: ${treated})` : ": hard cut, untreated (pointer.enterFrom / exit, or a push)"}`);
}

// ---------- captions ----------
function parseSrt(path) {
  if (!existsSync(path)) return [];
  const ts = (x) => { const [h, m, s] = x.trim().replace(",", ".").split(":"); return Number(h) * 3600 + Number(m) * 60 + Number(s); };
  return readFileSync(path, "utf8").trim().split(/\n\s*\n/).map((b) => {
    const l = b.split("\n");
    const [a, z] = l[1].split(" --> ");
    return { start: ts(a), end: ts(z), text: l.slice(2).join(" ") };
  });
}
const caps = parseSrt(srtPath);
if (!caps.length && cues.captions !== false) add("warn", "captions", null, null, `no captions read from ${srtPath}`);
if (caps.length) caps[caps.length - 1].last = true;
for (const prob of lintCaptions(caps)) {
  const i = Number(/caption (\d+)/.exec(prob)?.[1]);
  add(/overlaps/.test(prob) ? "error" : "warn", "captions", null, caps[i]?.start, `${prob}: "${caps[i]?.text ?? ""}"`);
}

// dead air: a caption that ends well before the next cut over a still stretch
const cuts = [];
for (const s of scenes) {
  for (let k = 1; k < s.ranges.length; k++) if (Math.abs(s.ranges[k - 1].srcOut - s.ranges[k].srcIn) > 1 / FPS) cuts.push(s.start + s.ranges[k].filmIn);
  cuts.push(s.start + s.duration);
}
cuts.sort((a, b) => a - b);
const ACTIVE = new Set(["move", "down", "up", "type", "scroll", "mark", "waitStart", "waitEnd"]); // marks and wait ends: something appeared
/** Film time where the last logged activity in [t0, t1] ends (t0 when nothing moves in it). */
function lastActivity(t0, t1) {
  let last = t0;
  for (const s of scenes) {
    if (!s.sb || t1 <= s.start || t0 >= s.start + s.duration) continue;
    const tk = take(s.sb.take);
    for (const r of s.ranges) {
      const f0 = s.start + r.filmIn, a = Math.max(t0, f0), b = Math.min(t1, f0 + r.filmDur);
      if (b <= a) continue;
      if (r.timelapse) { last = Math.max(last, b); continue; } // a time-lapse is motion throughout
      const sa = r.srcIn + (a - f0) * r.rate, sb_ = r.srcIn + (b - f0) * r.rate;
      for (const e of tk.events) {
        if (!ACTIVE.has(e.type) || e.t >= sb_ || (e.tEnd ?? e.t) < sa) continue;
        last = Math.max(last, Math.min(b, f0 + (Math.min(e.tEnd ?? e.t, sb_) - r.srcIn) / r.rate));
      }
    }
  }
  return last;
}
// a caption that goes and leaves a still picture for more than TAIL s before the cut
for (const c of caps) {
  const cut = cuts.find((t) => t >= c.end - 1e-6);
  if (cut == null || caps.some((x) => x.start >= c.end && x.start < cut)) continue;
  const stillFrom = lastActivity(c.end, cut);
  if (cut - stillFrom > TAIL)
    add("warn", "dead air", null, c.end, `"${c.text}" ends ${(cut - c.end).toFixed(2)} s before the cut at ${cut.toFixed(2)}; nothing logged moves for the last ${(cut - stillFrom).toFixed(2)} s: end the scene sooner or carry the caption`);
}

// claims: "claims": "mark:<label>" on a storyboard caption; its quoted phrase must be in the mark's text
const norm = (x) => x.toLowerCase().replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/\s+/g, " ").trim();
for (const s of sb.scenes) for (const c of s.captions ?? []) {
  if (!c.claims) continue;
  let text;
  try { text = eventText(take(s.take), c.claims); } catch (e) { add("error", "claims", s.id, null, `"${c.text}": ${e.message.split(". Known")[0]}`); continue; }
  const quoted = [...c.text.matchAll(/["“”‘]([^"“”’]+)["“”’]/g)].map((m) => m[1]);
  if (!quoted.length) { add("warn", "claims", s.id, null, `"${c.text}" claims ${c.claims} but quotes nothing ("…"): nothing checked`); continue; }
  if (text == null) { add("warn", "claims", s.id, null, `"${c.text}": ${c.claims} has no logged text (re-record with a recorder that logs mark text)`); continue; }
  for (const q of quoted) if (!norm(text).includes(norm(q))) add("error", "claims", s.id, null, `"${q}" is not in ${c.claims} (it reads: "${text.slice(0, 80)}")`);
}

// ---------- holds (python, on the real build) ----------
if (!argv.includes("--no-holds")) {
  const missing = scenes.find((s) => !existsSync(join(PROJECT_DIR, "compositions", `${s.id}.html`)) || !existsSync(join(PROJECT_DIR, "assets/footage", `${s.id}.mp4`)));
  if (edlPath !== join(PROJECT_DIR, "edl.json") || missing) add("skip", "holds", null, null, missing ? `needs a real build (no clip or composition for ${missing.id})` : "runs on the project's own edl.json only");
  else {
    const r = spawnSync("python3", [join(FILM_DIR, "scripts/holds.py"), String(HOLD), sbPath, "--takes", takesDir], { cwd: PROJECT_DIR, encoding: "utf8", maxBuffer: 1 << 26 });
    if (r.status !== 0) add("skip", "holds", null, null, `holds.py failed: ${(r.stderr || "").trim().split("\n").pop()}`);
    else for (const line of r.stdout.split("\n")) {
      const m = /^(\S+)\s+film\s+([\d.]+)-\s*([\d.]+) \(([\d.]+) s\)\s+(.*)$/.exec(line);
      if (m) add("warn", "holds", m[1], Number(m[2]), `${m[4]} s still: ${m[5].replace(/\s+/g, " ")}`);
    }
  }
}

// ---------- report ----------
const order = { error: 0, warn: 1, skip: 2, ok: 3 };
rows.sort((a, b) => order[a.level] - order[b.level] || Number(a.film || 0) - Number(b.film || 0));
const errors = rows.filter((r) => r.level === "error").length, warns = rows.filter((r) => r.level === "warn").length;
if (argv.includes("--json")) console.log(JSON.stringify({ errors, warnings: warns, rows }, null, 2));
else {
  if (rows.length) console.table(rows);
  console.log(`audit: ${errors} error(s), ${warns} warning(s) (holds > ${HOLD} s, jumps > ${JUMP} px, dead air > ${TAIL} s) on ${edlPath.replace(PROJECT_DIR + "/", "")}`);
}
process.exit(errors ? 1 : 0);
