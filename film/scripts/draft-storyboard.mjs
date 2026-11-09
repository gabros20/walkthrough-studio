// A first-pass storyboard from one or more recorded takes: the baseline an editor refines.
//
//   node scripts/draft-storyboard.mjs <take dir or events.json> [...more takes] [--take name] [--out storyboard.draft.json]
//
// One scene per take, in the order given:
//   - ranges: the take's usable span (take.json sync.keep; else the sync flashes; else the whole
//     video), with every agent wait longer than 4 s (a waitStart/waitEnd pair) as wait sugar:
//     1.8 s of loaders at normal speed, the rest as a labelled 2.8 s time-lapse
//   - camera: every click (down event) framed as a control 0.6 s before the press
//   - captions: a placeholder "TODO: <label>" 0.2 s before every click
//   - _candidates.spotlights: every mark, with its text when the recorder logged one (the build
//     ignores _candidates; move the ones you want into "spotlights")
// Clicks inside the compressed part of a wait, or too close to the scene edges, are left out.
// --take names the scene's take folder when a single events.json sits outside one.
// Then: node build.mjs <draft> --dry, fix what it reports, and edit: cut ranges, drop most framings
// and captions, write real caption text, choose exits. Nothing here is a creative decision.

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
const inputs = argv.filter((a, i) => !a.startsWith("--") && !["--take", "--out"].includes(argv[i - 1]));
if (!inputs.length) { console.error("usage: node scripts/draft-storyboard.mjs <take dir or events.json> [...] [--take name] [--out file]"); process.exit(1); }
const out = resolve(opt("out") ?? "storyboard.draft.json");

const LONG_WAIT = 4, LOADERS = 1.8, TIMELAPSE = 2.8, CAM_LEAD = 0.6, CAP_LEAD = 0.2;
const r3 = (x) => Math.round(x * 1000) / 1000;

function readTake(input) {
  const file = statSync(input).isDirectory() ? join(input, "events.json") : input;
  const dir = dirname(resolve(file));
  const ev = JSON.parse(readFileSync(file, "utf8"));
  const tjPath = join(dir, "take.json");
  const tj = existsSync(tjPath) ? JSON.parse(readFileSync(tjPath, "utf8")) : {};
  const name = (inputs.length === 1 && opt("take")) || ev.take || basename(dir);
  return { ev, tj, dir, name };
}

/** "type:label" for the nth event of that (type, label), "#n" only when it is not the first. */
function refFor(events, e) {
  const same = events.filter((x) => x.type === e.type && x.label === e.label);
  const n = same.indexOf(e) + 1;
  return `${e.type}:${e.label}${n > 1 ? `#${n}` : ""}`;
}

function scene({ ev, tj, name }, k) {
  const events = ev.events ?? [];
  // the usable span
  let start, end, from, to;
  if (tj.sync?.keep) { start = tj.sync.keep.from; end = tj.sync.keep.to; from = { ref: "keep:from" }; to = { ref: "keep:to" }; }
  else {
    const syncs = events.filter((e) => e.type === "sync");
    const s0 = syncs.find((e) => /start/.test(e.label)), s1 = [...syncs].reverse().find((e) => /end/.test(e.label));
    start = s0 ? s0.t + 0.2 : 0; end = s1 ? s1.t - 0.13 : ev.video?.duration ?? events.at(-1)?.t ?? 0;
    from = s0 ? { ref: refFor(events, s0), offset: 0.2 } : 0;
    to = s1 ? { ref: refFor(events, s1), offset: -0.13 } : r3(end);
  }
  // agent waits over LONG_WAIT s become wait sugar; ranges stay contiguous
  const waits = [];
  for (const ws of events.filter((e) => e.type === "waitStart")) {
    const we = events.find((e) => e.type === "waitEnd" && e.label === ws.label && e.t >= ws.t);
    if (we && we.t - ws.t > LONG_WAIT && ws.t > start && we.t < end) waits.push({ ws, we });
  }
  const ranges = [];
  if (!waits.length) ranges.push({ from, to });
  waits.forEach((w, i) => {
    ranges.push({
      from: i === 0 ? from : { ref: refFor(events, w.ws) },
      wait: w.ws.label,
      to: i + 1 < waits.length ? { ref: refFor(events, waits[i + 1].ws) } : to,
      loaders: LOADERS,
      timelapse: TIMELAPSE,
      label: "Time-lapse",
    });
  });
  // a range's first piece (from..waitStart+loaders) must not be empty
  if (waits.length && waits[0].ws.t + LOADERS <= start) throw new Error(`${name}: the first wait starts before the usable span`);
  const compressed = (t) => waits.some((w) => t > w.ws.t + LOADERS && t < w.we.t);
  const usable = (t, lead) => t - lead >= start && t <= end - 0.5 && !compressed(t) && !compressed(t - lead);

  const downs = events.filter((e) => e.type === "down" && e.box && usable(e.t, CAM_LEAD));
  const camera = downs.map((e) => ({ at: { ref: refFor(events, e), offset: -CAM_LEAD }, box: refFor(events, e), kind: "control" }));
  // placeholders end before the next one starts (short holds then show up in the caption lint:
  // a sign there are too many captions, which is the point of a draft)
  const captions = downs.map((e, i) => {
    const next = downs[i + 1];
    const between = next && waits.some((w) => w.ws.t > e.t && w.ws.t < next.t);
    const hold = next && !between ? Math.max(0.5, Math.min(2.4, next.t - e.t - 0.1)) : 2.4;
    return { text: `TODO: ${e.label}`, at: { ref: refFor(events, e), offset: -CAP_LEAD }, hold: r3(hold) };
  });
  const marks = events.filter((e) => e.type === "mark" && e.box && e.t >= start && e.t <= end);
  const spotlights = marks.map((e) => ({ box: refFor(events, e), start: { ref: refFor(events, e) }, duration: 1.5, ...(e.text ? { text: String(e.text).slice(0, 120) } : {}) }));

  // estimated film length: kept span minus what the time-lapses take out
  const est = end - start - waits.reduce((a, w) => a + (w.we.t - (w.ws.t + LOADERS)) - TIMELAPSE, 0);
  return {
    id: `s${k + 1}`,
    take: name,
    target: Math.round(est * 10) / 10,
    ranges,
    camera,
    captions,
    exit: { type: "hard" },
    _candidates: { spotlights },
  };
}

const takes = inputs.map(readTake);
const scenes = takes.map(scene);
const takesDirs = [...new Set(takes.map((t) => dirname(t.dir)))];
if (takesDirs.length > 1) console.warn(`warning: the takes sit in ${takesDirs.length} folders; takesDir is the first, pass --takes to the build for the others`);
const total = 8 + 7 + scenes.reduce((a, s) => a + s.target, 0);
const sb = {
  note: `Draft from ${takes.map((t) => t.name).join(", ")} by scripts/draft-storyboard.mjs. Refine before building for real: see docs/STORYBOARD.md.`,
  takesDir: relative(dirname(out), takesDirs[0]) || ".",
  target: { min: Math.floor(total * 0.9), max: Math.ceil(total * 1.1) },
  title: { duration: 8 },
  end: { duration: 7 },
  scenes,
};
writeFileSync(out, JSON.stringify(sb, null, 2) + "\n");
console.log(`wrote ${out}: ${scenes.length} scene(s), ${scenes.reduce((a, s) => a + s.ranges.filter((r) => r.wait).length, 0)} agent wait(s), ${scenes.reduce((a, s) => a + s.camera.length, 0)} framings, ${scenes.reduce((a, s) => a + s.captions.length, 0)} caption placeholders, ${scenes.reduce((a, s) => a + s._candidates.spotlights.length, 0)} spotlight candidates; about ${Math.round(total)} s`);
