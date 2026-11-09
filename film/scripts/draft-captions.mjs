#!/usr/bin/env node
// Caption drafting: the tool prepares and checks, an agent writes the words. No model call in here.
//
//   node <kit>/film/scripts/draft-captions.mjs brief [storyboard.json] [--takes <dir>] [--brand f] [--project d]
//        [--out captions.brief.md] [--json captions.brief.json] [--answers captions.answers.json]
//        [--all] [--voice] [--wps 2.6]
//   node <kit>/film/scripts/draft-captions.mjs apply captions.answers.json [storyboard.json] [--takes <dir>]
//        [--brand f] [--project d] [--out storyboard.json] [--force]
//
// brief: for every caption whose text starts with "TODO:" (every caption with --all) it gathers the
// scene's intent (the optional scene field "intent"; else the scene id and take), the anchoring event,
// the click target, the marks logged within 3 s of the anchor or while the caption could be on screen
// (with their text), typed text nearby, the next two events, the caption's window in film seconds
// (from its start to the next caption or 0.1 s before the scene's cut, whichever is first), the most
// words that fit that window under the hold rule (0.5 s + 0.3 s a word, at most 10), and a claim
// candidate (the nearest marked text on screen in the window). Times come from the build itself:
// `build.mjs --dry --dry-out <tmp>` writes edl.json, and every anchor goes through its ranges, so
// the brief and the film agree to the frame. Writes, beside the storyboard unless told otherwise:
//   captions.brief.md      one section per caption, with fillable "answer:" and "claims:" lines
//   captions.brief.json    the same data for tools
//   captions.answers.json  a blank answer file, only when there is none yet:
//                          { "<scene>:<index>": { "text": "", "claims": null }, ... }
// --voice adds, per scene, the voice window (the scene's film seconds) and the words that fit at
// --wps (2.6) words a second, for the narration line of a voiceover script.
//
// apply: reads the answers ({ "<scene>:<index>": { "text": "...", "claims": "mark:<label>" | null }
// or { "drop": true }; a bare string is the text) and writes them into the storyboard:
//   - the text replaces the caption's text; an empty text leaves the caption as it is (skipped);
//     { "drop": true } removes the caption; "<scene>:voice" keys are narration and are not written
//   - a phrase in straight or curly double quotes is UI text: it must appear in a mark's logged text.
//     With "claims" given, in that event's text; without, the mark of the scene's take that holds
//     every quoted phrase and is nearest the caption's anchor is found and set as "claims". A quoted
//     phrase no mark holds is an error. A caption that quotes nothing loses a stale "claims".
//   - an answer over 10 words, or over the most its window fits, is refused unless --force
//   - a numeric "hold" shorter than the hold rule asks for the new text is raised (within the window)
//   - then the caption lint (lib/captions.mjs lintCaptions) runs on the film's captions and its
//     problems are printed, with the TODO placeholders still left
// Nothing is written when there is an error or a refusal (exit 1). Otherwise the storyboard (or
// --out) is written, and the file it replaces is kept as <file>.bak.
// Then: node <kit>/film/build.mjs <storyboard> --dry --audit (the claims check runs there too).
// How-to with a worked example: docs/CAPTIONS.md.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { anchorTime, checkTakeSchema, eventText, findRef, gridFps, snapTo } from "../lib/edl.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUILD = resolve(HERE, "../build.mjs");
const args = process.argv.slice(2);
const sub = args[0];
const VALUED = ["--takes", "--brand", "--project", "--out", "--json", "--answers", "--wps"];
const opt = (name, def = null) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
const positional = args.slice(1).filter((a, i) => !a.startsWith("--") && !VALUED.includes(args[i]));
if (!["brief", "apply"].includes(sub) || flag("help") || (sub === "apply" && !positional.length)) {
  const src = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  console.log(src.slice(1, src.findIndex((l) => l.startsWith("import "))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n").trim());
  process.exit(flag("help") ? 0 : 1);
}
const die = (m) => { console.error(`error: ${m}`); process.exit(1); };
const rel = (p) => { const r = relative(process.cwd(), p); return !r ? p : r.startsWith("..") ? p : r; };
const r2 = (x) => Math.round(x * 100) / 100;
const f2 = (x) => (x == null ? "-" : x.toFixed(2));
const wordsOf = (t) => (String(t).trim().match(/\S+/g) || []).length;

// ---------- inputs ----------
const projectOpt = opt("project") ?? process.env.FILM_PROJECT ?? null;
const sbGiven = sub === "brief" ? positional[0] : positional[1];
const sbPath = resolve(sbGiven ?? join(projectOpt ?? process.cwd(), "storyboard.json"));
if (!existsSync(sbPath)) die(`no storyboard at ${rel(sbPath)} (pass a path, or run where storyboard.json is)`);
const sb = JSON.parse(readFileSync(sbPath, "utf8"));
const SB_DIR = dirname(sbPath);
const brandArg = opt("brand") ? ["--brand", resolve(opt("brand"))] : [];
const projectArg = projectOpt ? ["--project", resolve(projectOpt)] : [];
const takesDir = opt("takes") ? resolve(opt("takes"))
  : process.env.WALKTHROUGH_TAKES ? resolve(process.env.WALKTHROUGH_TAKES)
  : sb.takesDir ? (isAbsolute(sb.takesDir) ? sb.takesDir : resolve(SB_DIR, sb.takesDir))
  : [join(SB_DIR, "takes"), resolve(SB_DIR, "../takes")].find(existsSync) ?? join(SB_DIR, "takes");
if (!existsSync(takesDir)) die(`takes folder not found: ${takesDir} (pass --takes <dir>)`);

// lib/captions.mjs reads the brand and storyboard through lib/config.mjs, which takes them from the
// command line at import time: show it this storyboard (and brand/project) instead of our own argv
process.argv = [process.argv[0], process.argv[1], sbPath, ...brandArg, ...projectArg];
const { captionHold, lintCaptions } = await import("../lib/captions.mjs");
const { CAPTION } = await import("../lib/config.mjs");
const MAX_WORDS = CAPTION.maxWords;

const takes = new Map();
function take(name) {
  if (!takes.has(name)) {
    const dir = join(takesDir, name);
    if (!existsSync(join(dir, "events.json"))) die(`take ${name}: no events.json in ${dir}`);
    const ev = checkTakeSchema(JSON.parse(readFileSync(join(dir, "events.json"), "utf8")), name);
    const tj = existsSync(join(dir, "take.json")) ? JSON.parse(readFileSync(join(dir, "take.json"), "utf8")) : {};
    takes.set(name, { ...ev, keep: tj.sync?.keep ?? null });
  }
  return takes.get(name);
}

/** "type:label", "#n" only when the event is not the first of that type and label (as the draft writes refs). */
function refFor(events, e) {
  const same = events.filter((x) => x.type === e.type && x.label === e.label);
  const n = same.indexOf(e) + 1;
  return `${e.type}:${e.label}${n > 1 ? `#${n}` : ""}`;
}

// claims: the same quote pattern and normalisation as scripts/audit.mjs, so apply and the audit agree
const QUOTE = /["“”‘]([^"“”’]+)["“”’]/g;
const quotesIn = (text) => [...String(text).matchAll(QUOTE)].map((m) => m[1]);
const norm = (x) => x.toLowerCase().replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/\s+/g, " ").trim();
const holds = (text, q) => text != null && norm(text).includes(norm(q));

// ---------- the build's timing ----------
/** build.mjs --dry --dry-out <tmp> on a storyboard: the edl.json and cues.json it would write. */
function dryRun(file) {
  const dir = mkdtempSync(join(tmpdir(), "draft-captions-"));
  try {
    const r = spawnSync(process.execPath, [BUILD, file, "--dry", "--dry-out", dir, "--takes", takesDir, ...brandArg, ...projectArg], { cwd: dirname(file), encoding: "utf8", maxBuffer: 1 << 26 });
    if (r.status !== 0) die(`the dry build failed (node ${rel(BUILD)} ${rel(file)} --dry):\n${(r.stderr || r.stdout || "").trim().split("\n").slice(-8).join("\n")}`);
    return { edl: JSON.parse(readFileSync(join(dir, "edl.json"), "utf8")), cues: JSON.parse(readFileSync(join(dir, "cues.json"), "utf8")) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Every caption of the storyboard on the film clock, the way build.mjs places it: the anchor snapped
 * to the scene's grid and mapped through edl.json's ranges (a time inside an excised span maps to
 * the first frame after it), start snapped to the film fps, end from "end" or "hold" (default: the
 * hold rule for its text), clipped 0.1 s before the scene's cut unless "overCut".
 */
function timeline(story, { edl, cues }) {
  const FPS = edl.fps;
  const out = [];
  for (const sc of story.scenes) {
    const e = edl.scenes.find((x) => x.id === sc.id);
    if (!e) die(`scene ${sc.id} is not in the dry build's edl.json`);
    const tk = take(sc.take);
    const grid = gridFps(edl.fps, edl.clipFps, tk.fps);
    const local = (src) => {
      for (const r of e.ranges) if (src >= r.srcIn - 1e-9 && src <= r.srcOut + 1e-9) return r.filmIn + (src - r.srcIn) / r.rate;
      for (const g of e.excised ?? []) if (src > g.from && src < g.to) return local(g.to);
      return null;
    };
    const film = (src) => { const t = local(src); return t == null ? null : e.start + t; };
    const lastOk = snapTo(e.start + e.duration - 0.1, FPS);
    (sc.captions ?? []).forEach((c, i) => {
      const src = snapTo(anchorTime(tk, c.at), grid);
      const t = local(src);
      if (t == null) die(`${sc.id}:${i}: anchor ${JSON.stringify(c.at)} falls in cut footage`);
      const start = snapTo(e.start + snapTo(t, FPS), FPS);
      const endAnchor = c.end ? film(snapTo(anchorTime(tk, c.end), grid)) : null;
      out.push({ key: `${sc.id}:${i}`, sc, i, c, tk, e, film, srcAt: anchorTime(tk, c.at), start, endAnchor: endAnchor == null ? null : snapTo(endAnchor, FPS), lastOk });
    });
  }
  out.sort((a, b) => a.start - b.start);
  return { items: out, fps: FPS, total: cues.duration };
}

/** Where a caption's text may run: to the next (kept) caption or the scene's cut, film seconds. */
function windowOf(x, items, total) {
  const next = items.find((y) => y !== x && !y.dropped && y.start > x.start + 1e-6);
  const cut = x.c.overCut ? total : x.lastOk;
  const end = next && next.start < cut ? next.start : cut;
  const until = next && next.start < cut ? `the next caption (${next.key})` : x.c.overCut ? "the film's end" : `0.1 s before the cut out of ${x.sc.id}`;
  return { start: x.start, end, seconds: r2(end - x.start), until };
}
/** The most words a window holds under the hold rule (0.5 s + 0.3 s a word), at most the lint's limit. */
const fitWords = (seconds) => Math.max(0, Math.min(MAX_WORDS, Math.floor((seconds - 0.5) / 0.3 + 1e-6)));
/** The end build.mjs gives a caption with this text. */
function endOf(x, text, c = x.c) {
  let end = x.endAnchor ?? snapTo(x.start + (c.hold ?? captionHold(text)), x.fps);
  if (end > x.lastOk && !c.overCut) end = x.lastOk;
  return end;
}

// ---------- brief ----------
function brief() {
  const dry = dryRun(sbPath);
  const { items, fps, total } = timeline(sb, dry);
  for (const x of items) x.fps = fps;
  const all = flag("all");
  const chosen = items.filter((x) => all || /^\s*TODO:/i.test(x.c.text ?? ""));
  const lastKey = items.at(-1)?.key;
  const NEAR = 3;

  const entries = chosen.map((x) => {
    const { tk, c, sc } = x;
    const ev = typeof c.at === "number" ? null : findRef(tk, c.at.ref);
    const t0 = ev ? ev.t : x.srcAt;
    const win = windowOf(x, items, total);
    const visible = (f) => f != null && f >= win.start - 1e-6 && f <= win.end + 1e-6;
    const events = tk.events;
    const click = ev && (ev.type === "down" || ev.type === "up") ? ev.label
      : events.filter((e) => e.type === "down" && Math.abs(e.t - t0) <= 1).sort((a, b) => Math.abs(a.t - t0) - Math.abs(b.t - t0))[0]?.label ?? null;
    const marks = events
      .filter((e) => e.type === "mark")
      .map((e) => ({ ref: refFor(events, e), label: e.label, text: typeof e.text === "string" ? e.text : null, source: r2(e.t), film: x.film(e.t) == null ? null : r2(x.film(e.t)) }))
      .filter((m) => Math.abs(m.source - t0) <= NEAR || visible(m.film))
      .map((m) => ({ ...m, onScreenInWindow: visible(m.film) }));
    const typed = events
      .filter((e) => e.type === "type" && typeof e.text === "string" && Math.abs(e.t - t0) <= NEAR)
      .map((e) => ({ ref: refFor(events, e), label: e.label, text: e.text, source: r2(e.t), film: x.film(e.t) == null ? null : r2(x.film(e.t)) }));
    const after = ev ? events.indexOf(ev) + 1 : events.findIndex((e) => e.t > t0);
    const next = events.slice(Math.max(0, after))
      .filter((e) => e.label && !["cursor", "sync", "up"].includes(e.type) && e.t > t0 - 1e-6 && !(ev && e.type === ev.type && e.label === ev.label))
      .slice(0, 2)
      .map((e) => ({ ref: refFor(events, e), type: e.type, label: e.label, film: x.film(e.t) == null ? null : r2(x.film(e.t)) }));
    const withText = marks.filter((m) => m.text && m.text.trim());
    const pool = withText.some((m) => m.onScreenInWindow) ? withText.filter((m) => m.onScreenInWindow) : withText;
    const best = pool.sort((a, b) => Math.abs(a.source - t0) - Math.abs(b.source - t0))[0];
    // the suggested quote: the mark's first line, cut at a word under 60 characters (still a substring)
    const line = best ? best.text.split("\n").map((l) => l.trim()).find(Boolean) : null;
    const quote = line && line.length > 60 ? line.slice(0, 60).replace(/\s+\S*$/, "") : line;
    const last = x.key === lastKey;
    return {
      key: x.key, scene: sc.id, index: x.i, take: sc.take,
      intent: sc.intent ?? null,
      text: c.text,
      anchor: { ref: ev ? refFor(events, ev) : null, type: ev?.type ?? null, label: ev?.label ?? null, source: r2(x.srcAt), film: r2(x.start) },
      click, marks, typed, next,
      window: { ...win, start: r2(win.start), end: r2(win.end) },
      maxWords: fitWords(win.seconds),
      lastOfFilm: last,
      current: { words: wordsOf(c.text), hold: r2(endOf(x, c.text) - x.start), claims: c.claims ?? null },
      claimCandidate: best ? { ref: best.ref, text: best.text, quote } : null,
    };
  });

  const voice = flag("voice") ? sb.scenes.map((sc) => {
    const e = dry.edl.scenes.find((s) => s.id === sc.id);
    const wps = Number(opt("wps", 2.6));
    return { scene: sc.id, take: sc.take, intent: sc.intent ?? null, start: r2(e.start), seconds: r2(e.duration), wps, words: Math.floor(e.duration * wps) };
  }) : null;

  const out = resolve(opt("out") ?? join(SB_DIR, "captions.brief.md"));
  const jsonOut = resolve(opt("json") ?? out.replace(/\.md$/, "") + ".json");
  const answersOut = resolve(opt("answers") ?? join(dirname(out), "captions.answers.json"));

  const md = [
    `# Caption brief: ${basename(sbPath)}`,
    "",
    `${entries.length} caption(s)${all ? "" : " still marked TODO"}, from a dry build of \`${rel(sbPath)}\` over \`${rel(takesDir)}\` (${fps} fps; film times in seconds).`,
    "",
    "Write each answer into `" + rel(answersOut) + "` as `{ \"<scene>:<index>\": { \"text\": \"...\", \"claims\": null } }`",
    "(`{ \"drop\": true }` removes a caption; an empty text leaves it as it is), then run",
    "`node " + rel(join(HERE, "draft-captions.mjs")) + " apply " + rel(answersOut) + " " + rel(sbPath) + "`.",
    "",
    "Rules (docs/LOOK.md, Captions): one line, at most " + MAX_WORDS + " words and at most the window's `max words`; it says what is",
    "visibly true on screen at that moment, or it is cut. UI text goes in double quotes, copied from a mark's logged text",
    "(the claim candidate below, or another mark listed); apply finds the mark and sets `claims`, and the audit checks it.",
    "Every number comes from the recording. No invented outcomes, no adjectives the frame does not show.",
    "",
  ];
  for (const b of entries) {
    md.push(`## ${b.key}`, "");
    md.push(`- scene: ${b.scene} (take ${b.take})${b.intent ? `: ${b.intent}` : " (no `intent` in the storyboard)"}`);
    md.push(`- now: "${b.text}" (${b.current.words} words, holds ${f2(b.current.hold)} s${b.current.claims ? `, claims ${b.current.claims}` : ""})`);
    md.push(`- anchor: ${b.anchor.ref ?? "source second"} (source ${f2(b.anchor.source)} s, film ${f2(b.anchor.film)} s)${b.click ? `; ${b.anchor.type === "down" || b.anchor.type === "up" ? "click target" : "nearest click (within 1 s)"}: "${b.click}"` : ""}`);
    if (b.marks.length) {
      md.push("- marks (within 3 s of the anchor, or on screen in the window):");
      for (const m of b.marks) md.push(`  - \`${m.ref}\` ${m.film == null ? "cut out of the film" : `film ${f2(m.film)}`}${m.onScreenInWindow ? " (in the window)" : ""}: ${m.text ? JSON.stringify(m.text.length > 160 ? m.text.slice(0, 160) + "…" : m.text) : "(no text logged)"}`);
    } else md.push("- marks: none near");
    for (const t of b.typed) md.push(`- typed \`${t.ref}\` ${t.film == null ? "cut out of the film" : `film ${f2(t.film)}`}: ${JSON.stringify(t.text.length > 160 ? t.text.slice(0, 160) + "…" : t.text)}`);
    md.push(`- next: ${b.next.length ? b.next.map((n) => `${n.type} "${n.label}" (${n.film == null ? "cut out of the film" : `film ${f2(n.film)}`})`).join(", then ") : "nothing logged"}`);
    md.push(`- window: ${f2(b.window.start)}-${f2(b.window.end)} s (${f2(b.window.seconds)} s, until ${b.window.until}): **max ${b.maxWords} words**${b.lastOfFilm ? `; the film's last line wants at least 2.5 s${b.window.seconds < 2.5 ? ", more than this window has" : ""}` : ""}${b.maxWords === 0 ? ": too short for any caption; drop it or move it" : ""}`);
    md.push(`- claim candidate: ${b.claimCandidate ? `\`${b.claimCandidate.ref}\`, quote "${b.claimCandidate.quote}"` : "none (no marked text near): write without quotes"}`);
    md.push("", "answer: ", `claims: ${b.claimCandidate ? `${b.claimCandidate.ref} (only if the answer quotes it)` : "none"}`, "");
  }
  if (voice) {
    md.push("## Voice windows", "", `Narration per scene at ${voice[0]?.wps ?? 2.6} words a second (the voiceover script's line; not written to the storyboard).`, "");
    for (const v of voice) md.push(`### ${v.scene}:voice`, "", `- take ${v.take}${v.intent ? `: ${v.intent}` : ""}`, `- window: film ${f2(v.start)} s, ${f2(v.seconds)} s: **at most ${v.words} words**`, "", "narration: ", "");
  }
  writeFileSync(out, md.join("\n").replace(/\n+$/, "\n"));
  const answers = Object.fromEntries(entries.map((b) => [b.key, { text: "", claims: null }]));
  writeFileSync(jsonOut, JSON.stringify({ storyboard: sbPath, takesDir, fps, maxWords: MAX_WORDS, captions: entries, ...(voice ? { voice } : {}), answers }, null, 2) + "\n");
  const wrote = [out, jsonOut];
  if (!existsSync(answersOut) && entries.length) {
    writeFileSync(answersOut, JSON.stringify(answers, null, 2) + "\n");
    wrote.push(answersOut);
  }
  console.log(`wrote ${wrote.map(rel).join(", ")}`);
  console.log(`brief: ${entries.length} caption(s)${voice ? `, ${voice.length} voice window(s)` : ""}`);
}

// ---------- apply ----------
function apply() {
  const ansPath = resolve(positional[0]);
  if (!existsSync(ansPath)) die(`no answers at ${rel(ansPath)} (run brief first, then fill it)`);
  const answers = JSON.parse(readFileSync(ansPath, "utf8"));
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) die(`${rel(ansPath)}: expected { "<scene>:<index>": { "text": "...", "claims": null } }`);
  const dry = dryRun(sbPath);
  const story = structuredClone(sb);
  const { items, fps, total } = timeline(story, dry);
  for (const x of items) x.fps = fps;
  const byKey = new Map(items.map((x) => [x.key, x]));
  const errors = [], refused = [], notes = [], edits = [], skipped = [];

  for (const [key, raw] of Object.entries(answers)) {
    if (/:voice$/.test(key)) { notes.push(`${key}: narration, not written to the storyboard (it belongs in the voiceover script)`); continue; }
    const x = byKey.get(key);
    if (!x) { errors.push(`${key}: no such caption (keys are "<scene id>:<caption index>", e.g. "${items[0]?.key ?? "s1:0"}")`); continue; }
    const a = typeof raw === "string" ? { text: raw } : raw ?? {};
    if (a.drop === true) { x.dropped = true; continue; }
    const text = String(a.text ?? "").trim().replace(/\s+/g, " ");
    if (!text) { skipped.push(key); continue; }
    if (/^TODO:/i.test(text)) { errors.push(`${key}: the answer still starts with "TODO:"`); continue; }
    const quoted = quotesIn(text);
    let claims = null;
    if (typeof a.claims === "string" && a.claims.trim()) {
      claims = a.claims.trim();
      let logged;
      try { logged = eventText(x.tk, claims); } catch (e) { errors.push(`${key}: claims ${claims}: ${e.message.split(". Known")[0]}`); continue; }
      if (logged == null) { errors.push(`${key}: ${claims} has no logged text to check a quote against`); continue; }
      const miss = quoted.filter((q) => !holds(logged, q));
      if (miss.length) { errors.push(`${key}: ${miss.map((q) => `"${q}"`).join(", ")} not in ${claims} (it reads: ${JSON.stringify(logged.slice(0, 80))})`); continue; }
      if (!quoted.length) notes.push(`${key}: claims ${claims} but quotes nothing; the audit will check nothing`);
    } else if (quoted.length) {
      const events = x.tk.events;
      const hits = events.filter((e) => e.type === "mark" && typeof e.text === "string" && quoted.every((q) => holds(e.text, q)))
        .sort((p, q) => Math.abs(p.t - x.srcAt) - Math.abs(q.t - x.srcAt));
      if (!hits.length) {
        const lone = quoted.filter((q) => !events.some((e) => e.type === "mark" && holds(e.text ?? null, q)));
        errors.push(lone.length
          ? `${key}: ${lone.map((q) => `"${q}"`).join(", ")} matches no mark's logged text in take ${x.sc.take} (quote UI text exactly as a mark logged it, or drop the quotes)`
          : `${key}: the quoted phrases are on different marks; a caption claims one mark`);
        continue;
      }
      claims = refFor(events, hits[0]);
      const f = x.film(hits[0].t);
      const win = windowOf(x, items, total);
      if (f == null || f > win.end + 1e-6 || f < win.start - 3) notes.push(`${key}: ${claims} was logged at ${f == null ? "a cut-out moment" : `film ${f2(f)} s`}, outside the caption's window (${f2(win.start)}-${f2(win.end)} s): make sure the text is on screen while the caption is`);
    }
    edits.push({ x, text, claims });
  }

  // windows and word limits, with the drops applied
  for (const { x, text } of edits) {
    const win = windowOf(x, items, total);
    const fit = fitWords(win.seconds);
    const n = wordsOf(text);
    x.window = win;
    if (n > MAX_WORDS) refused.push(`${x.key}: ${n} words, the limit is ${MAX_WORDS}: "${text}"`);
    else if (n > fit) refused.push(`${x.key}: ${n} words, its window (${f2(win.seconds)} s, until ${win.until}) holds ${fit}: "${text}"`);
  }
  if (errors.length || (refused.length && !flag("force"))) {
    for (const e of errors) console.error(`error: ${e}`);
    for (const r of refused) console.error(`refused: ${r}${flag("force") ? "" : " (--force writes it anyway)"}`);
    console.error(`nothing written to ${rel(sbPath)}`);
    process.exit(1);
  }

  // write the answers into the copy
  const changes = [];
  // the film's last line holds at least 2.5 s (the audit lints the last caption with that rule)
  const lastKept = story.end?.lastCaption ? null : items.filter((y) => !y.dropped).at(-1);
  for (const { x, text, claims } of edits) {
    const c = story.scenes.find((s) => s.id === x.sc.id).captions[x.i];
    c.text = text;
    if (claims) c.claims = claims;
    else if (c.claims) { delete c.claims; notes.push(`${x.key}: quotes nothing now; its old "claims" was removed`); }
    // a draft's hold sized for "TODO: label" is often too short for the real line
    if (typeof c.hold === "number" && !c.end) {
      const need = Math.ceil(captionHold(text, x === lastKept) * 20 - 1e-6) / 20;
      if (c.hold < need - 1e-6) {
        const room = Math.floor((x.window.end - x.start) * 20 + 1e-6) / 20;
        const to = Math.min(need, Math.max(c.hold, room));
        if (to > c.hold + 1e-6) { notes.push(`${x.key}: hold ${f2(c.hold)} -> ${f2(to)} s (the hold rule asks ${f2(need)} s for ${wordsOf(text)} words${x === lastKept ? " on the film's last line" : ""})`); c.hold = to; }
      }
    }
    x.c = c;
    changes.push(`${x.key}  "${text}" (${wordsOf(text)} words, window ${f2(x.window.seconds)} s)${claims ? `  claims ${claims}` : ""}${refused.some((r) => r.startsWith(`${x.key}:`)) ? "  (forced)" : ""}`);
  }
  const drops = items.filter((x) => x.dropped);
  for (const sc of story.scenes) {
    const gone = new Set(drops.filter((x) => x.sc.id === sc.id).map((x) => x.i));
    if (gone.size) sc.captions = sc.captions.filter((_, i) => !gone.has(i));
  }

  // the caption lint on the whole film, as the build will place it
  const kept = items.filter((x) => !x.dropped);
  const lintItems = kept.map((x) => ({ key: x.key, text: x.c.text, start: x.start, end: endOf(x, x.c.text) }));
  if (story.end?.lastCaption) lintItems.push({ key: "end.lastCaption", ...story.end.lastCaption });
  if (lintItems.length) lintItems[lintItems.length - 1].last = true;
  const problems = lintCaptions(lintItems).map((p) => p.replace(/caption (\d+)/g, (_, i) => lintItems[Number(i)]?.key ?? `caption ${i}`));
  const todo = kept.filter((x) => /^\s*TODO:/i.test(x.c.text ?? "")).map((x) => x.key);

  const out = resolve(opt("out") ?? sbPath);
  const backedUp = existsSync(out);
  if (backedUp) copyFileSync(out, `${out}.bak`);
  writeFileSync(out, JSON.stringify(story, null, 2) + "\n");
  for (const l of changes) console.log(l);
  for (const x of drops) console.log(`${x.key}  dropped ("${x.c.text}")`);
  for (const n of notes) console.log(`note: ${n}`);
  if (skipped.length) console.log(`skipped (empty answer): ${skipped.join(", ")}`);
  if (problems.length) console.log(`caption lint:\n  ${problems.join("\n  ")}`);
  else console.log("caption lint: ok");
  if (todo.length) console.log(`TODO placeholders left: ${todo.join(", ")}`);
  console.log(`wrote ${rel(out)}${backedUp ? ` (previous version: ${rel(out)}.bak)` : ""}`);
  console.log(`captions: applied ${edits.length}, dropped ${drops.length}, skipped ${skipped.length}`);
  console.log(`next: node ${rel(BUILD)} ${rel(out)} --takes ${rel(takesDir)} --dry --audit`);
}

if (sub === "brief") brief();
else apply();
