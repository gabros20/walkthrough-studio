// Cleanup: what a project leaves on disk that it no longer needs (docs/CLI.md, "Cleaning up").
//
// The inventory covers the project folder, its studio root (checkpoints) and the buffer folder the
// disk policy spilled into (<buffer>/<project name>/). Nothing outside those three is ever removed:
// a path that resolves elsewhere (a symlink, a hand-edited state.spills entry) is listed as "refuse".
//
// Sizes: "logical" is the sum of file sizes (what Finder and `ls` show). On APFS a clone (cp -c,
// every studio checkpoint) counts in full there although it shares its blocks with the original, and
// `du` counts it in full too. "on disk" is what a row really costs: the bytes no other file shares
// (APFS private size) plus blocks shared only among files of this inventory, counted once, on the
// first row that holds them (rows that are kept come first). So the "on disk" total of the rows to
// remove is what removing them frees. Blocks a row shares with a file outside the inventory (a
// checkpoint and the live studio data it was cloned from) cost nothing here and are not freed.
// Measured by cli/lib/disk-usage.py (python3 -I); without it, "on disk" is the allocated size.
//
//   POLICY                                    the default rules, one line each (usage text)
//   studioPaths(project) -> Promise<{ config, root, checkpoints, run } | null>   studio/bin/paths.sh
//   allowedRoots(project, studio) -> [{ dir, real, what }]
//   inventory(project, { all, keepCheckpoints, keepTakes, measure }) -> Promise<inv>
//     inv = { rows, roots, studio, apfs, notes, totals }
//     row = { label, kind, paths, action: "remove" | "keep" | "refuse", reason, logical, onDisk, ref }
//   totalsOf(rows) -> { remove: { count, logical, onDisk }, keep: { … }, refuse: { … } }
//   reclaimable(project) -> Promise<{ now: inv, all: inv }>   both inventories, measured once (doctor, deliver)
//   printInventory(inv, { title })            the table and the two summary lines
//   removeRows(ctx, inv) -> { removed: [row], failed: [{ row, error }], measured }
//   recordCleanup(project, inv, result, opts) appends to state.cleanups and marks removed checkpoints/takes
//   systemFrameCache() -> { dir, bytes } | null   HyperFrames' default frame cache in the system temp
//                                                 folder (renders made without the project cache);
//                                                 shared by every project, so only reported
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, rmdirSync, rmSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { bufferOf, freeBytes } from "./disk.mjs";
import { announce, capture } from "./exec.mjs";
import { insideKit, kitPath, resolvedConfig } from "./project.mjs";
import { now } from "./state.mjs";
import { fmtBytes, printTable } from "./table.mjs";

export const POLICY = [
  "remove  raw frames (raw/frames.bin, frames.ndjson) of accepted takes; the whole raw/ with --all",
  "remove  rejected takes (ok false or not accepted, and not in the storyboard), unless --keep-takes all",
  "remove  studio checkpoints but the newest N (--keep-checkpoints, default 1) and the current one",
  "        (state.currentCheckpoint, state.pictureLock.checkpoint, the last restored); --all: every one",
  "remove  frame caches (.hyperframes/frames-cache, <buffer>/<project>/<step>/tmp and extract-cache)",
  "remove  render and zip copies left on the buffer, sound-build/.cache and analysis/, voiceover/cache-mock/,",
  "        draft renders a later render replaced, sound drafts older than their picture,",
  "        sheets/ and cuts/ of review bundles older than the latest; raw frames of capture tests",
  "keep    accepted take masters and events, the latest render per name and its sidecars, out/,",
  "        voiceover/cache/ (real TTS costs money), sound-build mixes and reports, the storyboard,",
  "        inputs and state.json; --all also removes the buffer folders, sound-build/bed.wav and",
  "        capture tests (run it after the client accepts the film)",
];

const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
};
const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
const exists = (p) => {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
};
const children = (d) => {
  try {
    return readdirSync(d).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  } catch {
    return [];
  }
};
const mtimeMs = (p) => {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
};
const bornMs = (p) => {
  try {
    const s = statSync(p);
    return s.birthtimeMs > 0 ? s.birthtimeMs : s.mtimeMs;
  } catch {
    return 0;
  }
};
const realOrNull = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
};
const inside = (p, root) => p.startsWith(root.endsWith("/") ? root : root + "/");

// ---------------------------------------------------------------- studio and roots

export async function studioPaths(project) {
  const c = await resolvedConfig(project);
  const cfg = c?.studio?.config;
  if (!cfg || !existsSync(cfg)) return null;
  const r = capture("bash", [kitPath("studio/bin/paths.sh")], { env: { STUDIO_CONFIG: cfg }, timeout: 30_000 });
  if (r.code !== 0) return { config: cfg, error: (r.stderr || r.stdout).trim().split("\n").at(-1) ?? "paths.sh failed" };
  const kv = Object.fromEntries(
    r.stdout
      .trim()
      .split("\n")
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
  return { config: cfg, root: kv.STUDIO_ROOT ?? null, checkpoints: c.studio.checkpointsDir ?? kv.STUDIO_CHECKPOINTS ?? null, run: kv.STUDIO_RUN ?? null };
}

export function allowedRoots(project, studio) {
  const roots = [{ dir: project.dir, what: "project" }];
  if (studio?.root) roots.push({ dir: studio.root, what: "studio root" });
  const buffer = bufferOf(project);
  if (buffer) roots.push({ dir: join(buffer, project.name), what: "buffer folder" });
  for (const r of roots) r.real = realOrNull(r.dir);
  return roots;
}

/** Where a path really points (its folder resolved, the last component not followed), and whether that is inside a root. */
export function checkTarget(p, roots) {
  const parent = realOrNull(dirname(p));
  if (!parent) return { ok: false, why: "its folder does not exist" };
  const real = join(parent, basename(p));
  if (insideKit(real)) return { ok: false, why: "inside the kit, which is never written to" };
  for (const r of roots) if (r.real && inside(real, r.real)) return { ok: true, root: r, real };
  return { ok: false, why: "outside the project, the studio root and the buffer folder: not touched", real };
}

// ---------------------------------------------------------------- labels

function labeler(project, studio, roots) {
  const home = homedir();
  return (p) => {
    if (inside(p, project.dir)) return relative(project.dir, p);
    if (studio?.root && inside(p, studio.root)) return `<studio>/${relative(studio.root, p)}`;
    const buf = roots.find((r) => r.what === "buffer folder");
    if (buf && inside(p, buf.dir)) return `<buffer>/${relative(dirname(buf.dir), p)}`;
    return p.startsWith(home + "/") ? `~/${relative(home, p)}` : p;
  };
}

// ---------------------------------------------------------------- the inventory

function storyboardTakes(project) {
  const sb = readJson(project.paths.storyboard);
  return new Set((sb?.scenes ?? []).map((s) => s?.take).filter((t) => typeof t === "string"));
}

export async function inventory(project, { all = false, keepCheckpoints = 1, keepTakes = "accepted", measure = true } = {}) {
  const P = project.dir;
  const s = project.state;
  const c = await resolvedConfig(project);
  const studio = await studioPaths(project);
  const roots = allowedRoots(project, studio);
  const label = labeler(project, studio, roots);
  const rows = [];
  const notes = [];
  const add = (kind, paths, action, reason, ref = null, name = null) => {
    paths = (Array.isArray(paths) ? paths : [paths]).filter(exists);
    if (!paths.length) return null;
    const row = { label: name ?? label(paths[0]), kind, paths, action, reason, ref };
    rows.push(row);
    return row;
  };

  // ---- studio checkpoints
  if (studio?.error) notes.push(`studio: ${studio.error} (checkpoints not listed)`);
  if (studio?.checkpoints && isDir(studio.checkpoints)) {
    let current = null;
    try {
      current = studio.run ? readFileSync(join(studio.run, "current-checkpoint"), "utf8").trim() || null : null;
    } catch {}
    const protect = new Map();
    if (s.currentCheckpoint?.name) protect.set(s.currentCheckpoint.name, "the current checkpoint (state.currentCheckpoint)");
    if (s.pictureLock?.checkpoint) protect.set(s.pictureLock.checkpoint, "named in state.pictureLock");
    if (current && !protect.has(current)) protect.set(current, "the last restored (studio run/current-checkpoint)");
    const cps = children(studio.checkpoints)
      .filter((n) => !n.startsWith(".") && isDir(join(studio.checkpoints, n)))
      .map((n) => ({ name: n, dir: join(studio.checkpoints, n), born: bornMs(join(studio.checkpoints, n)) }))
      .sort((a, b) => b.born - a.born || b.name.localeCompare(a.name));
    cps.forEach((cp, i) => {
      let action = "remove";
      let reason = `older than the newest ${keepCheckpoints} (--keep-checkpoints)`;
      if (all) reason = "--all: checkpoints are disposable once the film is accepted";
      else if (i < keepCheckpoints) [action, reason] = ["keep", keepCheckpoints === 1 ? "the newest checkpoint" : `one of the newest ${keepCheckpoints}`];
      else if (protect.has(cp.name)) [action, reason] = ["keep", protect.get(cp.name)];
      add("checkpoint", cp.dir, action, reason, { checkpoint: cp.name, born: cp.born });
    });
  }

  // ---- takes
  const takesDir = c?.takesDir ?? project.paths.takes;
  const inBoard = storyboardTakes(project);
  const keepRaw = Boolean(c?.finish?.keepRaw);
  const seenTakes = new Set();
  const takeDirOf = (name, t) => (t?.dir ? (isAbsolute(t.dir) ? t.dir : join(P, t.dir)) : join(takesDir, name));
  const names = new Set([...Object.keys(s.takes ?? {}), ...children(takesDir).filter((d) => !d.startsWith("_") && isDir(join(takesDir, d)))]);
  for (const name of [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
    const t = s.takes?.[name] ?? null;
    const dir = takeDirOf(name, t);
    if (seenTakes.has(dir) || !isDir(dir)) continue;
    seenTakes.add(dir);
    const used = inBoard.has(name);
    const accepted = t?.accepted === true || used;
    const rejected = !used && t && (t.accepted === false || (t.ok === false && t.accepted !== true));
    if (rejected) {
      if (keepTakes === "all") add("take", dir, "keep", "rejected, kept by --keep-takes all", { take: name });
      else add("take", dir, "remove", t.accepted === false ? "rejected (not accepted) and not in the storyboard" : "failed (ok false), not accepted, not in the storyboard", { take: name, rejected: true });
      if (keepTakes !== "all") continue;
    } else {
      const why = used ? (t?.accepted ? "accepted, in the storyboard" : "in the storyboard") : accepted ? "accepted" : t ? "not accepted yet (no go file said next)" : "not in state.json: left alone";
      add("take", children(dir).filter((f) => f !== "raw").map((f) => join(dir, f)), "keep", `master + events: ${why}`, { take: name }, label(dir) + "/");
    }
    const raw = join(dir, "raw");
    if (!isDir(raw)) continue;
    const frames = ["frames.bin", "frames.ndjson"].map((f) => join(raw, f)).filter(exists);
    if (all) add("raw frames", raw, "remove", "--all: raw/ of every take", { take: name, raw: "all" }, label(raw) + "/");
    else if (!frames.length) continue;
    else if (accepted && !rejected && keepRaw) add("raw frames", frames, "keep", "finish.keepRaw is true in walkthrough.config.mjs", { take: name }, label(raw) + "/frames.*");
    else if (accepted && !rejected) add("raw frames", frames, "remove", "the take is accepted: its master is the footage (raw/delivered.json stays for takes/INDEX.md)", { take: name, raw: "frames" }, label(raw) + "/frames.*");
    else add("raw frames", frames, "keep", "the take is not accepted yet (recorder/remux.mjs needs them)", { take: name }, label(raw) + "/frames.*");
  }
  // capture tests: <takes>/_capture-test/<run>/
  const ct = join(takesDir, "_capture-test");
  if (isDir(ct)) {
    if (all) add("capture test", ct, "remove", "--all: capture-test footage", null, label(ct) + "/");
    else
      for (const run of children(ct)) {
        const frames = ["frames.bin", "frames.ndjson"].map((f) => join(ct, run, "raw", f)).filter(exists);
        if (frames.length) add("capture test", frames, "remove", "raw frames of a capture test (result.json stays)", null, label(join(ct, run, "raw")) + "/frames.*");
      }
  }

  // ---- renders
  const R = join(P, "renders");
  const SIDECARS = ["cues.json", "edl.json", "captions.srt"];
  const renderFiles = (name) => [`${name}.mp4`, ...SIDECARS.map((x) => `${name}.${x}`)].map((f) => join(R, f));
  const latest = new Map(); // name -> latest state entry
  (s.renders ?? []).forEach((r, i) => r?.name && latest.set(r.name, { ...r, i }));
  const isDraft = (n) => /^draft/i.test(n);
  const lastFinalAt = Math.max(-1, ...[...latest.values()].filter((r) => !isDraft(r.name)).map((r) => r.i));
  for (const [name, r] of latest) {
    if (isDraft(name) && lastFinalAt > r.i) add("draft render", renderFiles(name), "remove", "a draft; a later render replaced it", { render: name }, `renders/${name}.{mp4,cues.json,edl.json,captions.srt}`);
    else add("render", renderFiles(name), "keep", "the latest render of this name + sidecars", { render: name }, `renders/${name}.{mp4,cues.json,edl.json,captions.srt}`);
  }
  if (isDir(R))
    for (const f of children(R)) {
      const m = f.match(/^(.+)-(sound|voiceover)\.mp4$/);
      if (!m) continue;
      const pic = [join(R, `${m[1]}.mp4`), join(R, `${m[1]}.picture-only.mp4`)].filter(exists).map(mtimeMs);
      const newer = pic.length && Math.max(...pic) > mtimeMs(join(R, f));
      if (newer) add("sound draft", join(R, f), "remove", `a ${m[2]} draft older than renders/${m[1]}: the picture was rendered again since`);
      else add("sound draft", join(R, f), "keep", `the ${m[2]} draft of the current picture`);
    }

  // ---- frame caches in the project
  add("frame cache", join(P, ".hyperframes", "frames-cache"), "remove", "HyperFrames frame cache (render remakes it)");

  // ---- buffer spills
  const spillDirs = new Map();
  for (const x of s.spills ?? []) if (x?.to) spillDirs.set(resolve(x.to), x.step ?? basename(x.to));
  for (const x of s.renders ?? []) if (x?.spill) spillDirs.set(resolve(x.spill), "render");
  for (const x of s.sound ?? []) if (x?.spill) spillDirs.set(resolve(x.spill), "sound");
  for (const x of s.deliveries ?? []) if (x?.spilled) spillDirs.set(resolve(x.spilled), "deliver");
  for (const [dir, step] of spillDirs) {
    if (!exists(dir)) continue;
    const chk = checkTarget(dir, roots);
    if (!chk.ok) {
      add("spill", dir, "refuse", `recorded in state.spills but ${chk.why}`);
      continue;
    }
    if (all) {
      add("spill", dir, "remove", `--all: the ${step} step's buffer folder`, { spill: dir });
      continue;
    }
    for (const sub of ["tmp", "extract-cache"]) add("frame cache", join(dir, sub), "remove", `the ${step} step's ${sub === "tmp" ? "TMPDIR" : "HyperFrames frame cache"} on the buffer`);
    for (const f of children(dir)) {
      const p = join(dir, f);
      if ((f.endsWith(".mp4") || f.endsWith(".zip")) && !isDir(p)) {
        const homeRel = f.endsWith(".zip") ? `out/${f}` : `renders/${f}`;
        let same = false;
        try {
          same = statSync(join(P, homeRel)).size === statSync(p).size;
        } catch {}
        if (same) add("spill", p, "remove", `a copy of ${homeRel} (copied home after the ${step})`);
        else add("spill", p, "keep", `${homeRel} is missing or differs: this may be the only copy`);
      } else if (f === "sound-build") {
        for (const sub of [".cache", "analysis"]) add("sound work", join(p, sub), "remove", "sound build intermediates (made again by the next build)");
      } else if (step === "deliver" && isDir(p)) add("spill", p, "keep", "the unzipped package on the buffer (the zip is in out/); removed by --all");
    }
  }

  // ---- sound-build
  const SB = join(P, "sound-build");
  if (isDir(SB)) {
    const work = [".cache", "analysis", ...(all ? ["bed.wav"] : [])];
    for (const sub of work) add("sound work", join(SB, sub), "remove", sub === "bed.wav" ? "--all: the bed alone (the mix and the delivered film keep the sound)" : "sound build intermediates (made again by the next build)");
    add("sound build", children(SB).filter((f) => !work.includes(f)).map((f) => join(SB, f)), "keep", "the mixes, last-build.json, beat grid and cost ledger", null, "sound-build/ (mix, last-build, beat grid, cost.jsonl)");
  }

  // ---- voiceover caches
  add("voiceover cache", join(P, "voiceover", "cache-mock"), "remove", "mock TTS audio (free to make again)");
  add("voiceover cache", join(P, "voiceover", "cache"), "keep", "real TTS audio: it cost money to make");

  // ---- review bundles: keep the latest whole, older ones lose sheets/ and cuts/
  const RV = join(P, "review");
  const bundles = new Map();
  for (const r of s.reviews ?? []) if (r?.out) bundles.set(resolve(P, r.out), Date.parse(r.at) || 0);
  if (isDir(RV)) for (const d of children(RV)) if (isDir(join(RV, d)) && !bundles.has(join(RV, d))) bundles.set(join(RV, d), mtimeMs(join(RV, d, "bundle.json")));
  const ordered = [...bundles].filter(([d]) => isDir(d)).sort((a, b) => b[1] - a[1]);
  ordered.forEach(([d], i) => {
    if (i === 0) add("review", d, "keep", "the latest review bundle", null, label(d) + "/");
    else add("review frames", [join(d, "sheets"), join(d, "cuts")], "remove", "sheets and cut strips of an older review bundle (REVIEW.md stays)", null, label(d) + "/{sheets,cuts}");
  });

  // ---- out/
  add("delivery", join(P, "out"), "keep", "the delivered films and packages", null, "out/");

  // every row to remove must resolve inside a root
  for (const row of rows) {
    if (row.action !== "remove") continue;
    const bad = row.paths.map((p) => checkTarget(p, roots)).find((x) => !x.ok);
    if (bad) [row.action, row.reason] = ["refuse", bad.why];
  }

  const sys = systemFrameCache();
  if (sys?.bytes > 100 * 1024 ** 2)
    notes.push(`HyperFrames' default frame cache ${sys.dir} holds ${fmtBytes(sys.bytes)} (renders made without the project cache; shared by every project, so not touched here: /bin/rm -rf it when no render is running)`);
  const inv = { rows, roots, studio, notes, apfs: null, opts: { all, keepCheckpoints, keepTakes } };
  if (measure) measureRows(inv);
  inv.totals = totalsOf(rows);
  return inv;
}

// ---------------------------------------------------------------- sizes

function nodeUsage(top) {
  const u = { exists: false, files: 0, logical: 0, allocated: 0, private: 0, unknownShared: 0, families: {} };
  const walk = (p) => {
    let st;
    try {
      st = lstatSync(p);
    } catch {
      return;
    }
    u.exists = true;
    const blocks = (st.blocks ?? 0) * 512;
    u.allocated += blocks;
    u.private += blocks;
    if (st.isDirectory()) for (const f of children(p)) walk(join(p, f));
    else {
      u.files++;
      u.logical += st.size;
    }
  };
  walk(top);
  return u;
}

/** Sizes of these paths: cli/lib/disk-usage.py (clone-aware), else a plain walk ({ apfs, items, fallback }). */
function usageOf(paths) {
  let res = null;
  if (paths.length) {
    const r = capture("python3", ["-I", kitPath("cli/lib/disk-usage.py"), ...paths], { timeout: 900_000 });
    if (r.code === 0)
      try {
        res = JSON.parse(r.stdout);
      } catch {}
  }
  return res ?? { apfs: false, fallback: paths.length > 0, items: Object.fromEntries(paths.map((p) => [p, nodeUsage(p)])) };
}

/** Fills row.logical and row.onDisk (see the header) and inv.apfs; `res` is a usageOf() result covering the rows' paths. */
export function measureRows(inv, res = null) {
  const rows = inv.rows;
  res ??= usageOf([...new Set(rows.flatMap((r) => r.paths))]);
  if (res.fallback) inv.notes.push("python3 -I cli/lib/disk-usage.py did not run: \"on disk\" is the allocated size (clones counted in full)");
  inv.apfs = Boolean(res.apfs);
  for (const row of rows) {
    row.logical = 0;
    row._private = 0;
    row._fam = {};
    for (const p of row.paths) {
      const u = res.items[p];
      if (!u) continue;
      row.logical += u.logical;
      row._private += u.private;
      for (const [id, [shared, refcnt, count]] of Object.entries(u.families ?? {})) {
        const f = (row._fam[id] ??= { shared, refcnt, count: 0 });
        f.count += count;
      }
    }
  }
  // clone groups: shared blocks count once, on the first row that holds them (kept rows first), and
  // only when every file that shares them is in the inventory
  const fams = new Map();
  for (const row of rows) for (const [id, f] of Object.entries(row._fam)) {
    const g = fams.get(id) ?? { shared: f.shared, refcnt: f.refcnt, count: 0, first: null };
    g.count += f.count;
    fams.set(id, g);
  }
  const order = [...rows.filter((r) => r.action === "keep"), ...rows.filter((r) => r.action === "refuse"), ...rows.filter((r) => r.action === "remove")];
  for (const row of order) {
    row.onDisk = row._private;
    for (const id of Object.keys(row._fam)) {
      const g = fams.get(id);
      if (g.first === null && g.count >= g.refcnt) {
        g.first = row;
        row.onDisk += g.shared;
      }
    }
  }
  for (const row of rows) {
    delete row._private;
    delete row._fam;
  }
  return inv;
}

export function totalsOf(rows) {
  const t = {};
  for (const a of ["remove", "keep", "refuse"]) {
    const rs = rows.filter((r) => r.action === a);
    t[a] = { count: rs.length, logical: rs.reduce((x, r) => x + (r.logical ?? 0), 0), onDisk: rs.reduce((x, r) => x + (r.onDisk ?? 0), 0) };
  }
  return t;
}

// ---------------------------------------------------------------- output

export function printInventory(inv, { title = null } = {}) {
  if (title) console.log(title);
  for (const n of inv.notes) console.log(`note: ${n}`);
  const order = { remove: 0, refuse: 1, keep: 2 };
  const rows = [...inv.rows].sort((a, b) => order[a.action] - order[b.action]);
  printTable(
    rows.map((r) => ({ item: r.label, kind: r.kind, logical: fmtBytes(r.logical), "on disk": fmtBytes(r.onDisk), action: r.action, reason: r.reason })),
    ["item", "kind", { key: "logical", align: "right" }, { key: "on disk", align: "right" }, "action", "reason"],
  );
  const t = inv.totals;
  console.log(`\nremove: ${t.remove.count} item(s), logical ${fmtBytes(t.remove.logical)}, on disk ${fmtBytes(t.remove.onDisk)} (what removing them frees)`);
  console.log(`keep:   ${t.keep.count} item(s), logical ${fmtBytes(t.keep.logical)}, on disk ${fmtBytes(t.keep.onDisk)}${t.refuse.count ? `; refused: ${t.refuse.count} (outside the allowed folders, never touched)` : ""}`);
  if (inv.apfs) console.log("APFS clones share blocks: \"logical\" counts every clone in full (Finder, du); \"on disk\" counts shared blocks once, and not at all when a file outside this list still uses them.");
  else if (inv.rows.length) console.log("\"on disk\" is the allocated size (no APFS clone information on this volume).");
}

// ---------------------------------------------------------------- removal

export function removeRows(ctx, inv) {
  const removed = [];
  const failed = [];
  const vols = new Map();
  for (const r of inv.roots) {
    if (!r.real) continue;
    const f = freeBytes(r.real);
    if (f && !vols.has(f.mount)) vols.set(f.mount, { path: r.real, before: f.free });
  }
  for (const row of inv.rows) {
    if (row.action !== "remove") continue;
    const bad = row.paths.map((p) => checkTarget(p, inv.roots)).find((x) => !x.ok);
    if (bad) {
      failed.push({ row, error: `refused: ${bad.why}` });
      continue;
    }
    announce("/bin/rm", ["-rf", ...row.paths]);
    try {
      for (const p of row.paths) rmSync(p, { recursive: true, force: true });
      removed.push(row);
      if (row.ref?.spill) {
        // an emptied <buffer>/<project>/ goes too
        const parent = dirname(row.ref.spill);
        const buf = inv.roots.find((r) => r.what === "buffer folder");
        try {
          if (buf && resolve(parent) === resolve(buf.dir) && !readdirSync(parent).length) rmdirSync(parent);
        } catch {}
      }
    } catch (err) {
      failed.push({ row, error: String(err?.message ?? err).split("\n")[0] });
    }
  }
  let measured = 0;
  for (const v of vols.values()) {
    const f = freeBytes(v.path);
    if (f) measured += Math.max(0, f.free - v.before);
  }
  return { removed, failed, measured };
}

export function systemFrameCache() {
  const dir = join(tmpdir(), `hyperframes-extract-cache-${process.getuid?.() ?? "u"}`);
  if (!isDir(dir)) return null;
  const r = capture("du", ["-sk", dir], { timeout: 60_000 });
  const kb = Number(r.stdout.trim().split(/\s+/)[0]);
  return { dir, bytes: Number.isFinite(kb) ? kb * 1024 : null };
}

export function recordCleanup(project, inv, result, { by = "clean" } = {}) {
  const s = project.state;
  const at = now();
  for (const row of result.removed) {
    if (row.ref?.checkpoint) for (const c of s.checkpoints ?? []) if (c.name === row.ref.checkpoint && !c.removedAt) c.removedAt = at;
    if (row.ref?.take && s.takes?.[row.ref.take]) {
      if (row.ref.rejected) s.takes[row.ref.take].removedAt = at;
      else if (row.ref.raw) s.takes[row.ref.take].rawRemoved = row.ref.raw;
    }
  }
  const freed = result.removed.reduce((x, r) => x + (r.onDisk ?? 0), 0);
  (s.cleanups ??= []).push({
    at,
    by,
    all: inv.opts.all,
    keepCheckpoints: inv.opts.keepCheckpoints,
    keepTakes: inv.opts.keepTakes,
    removed: result.removed.length,
    failed: result.failed.length,
    refused: inv.totals.refuse.count,
    logical: result.removed.reduce((x, r) => x + (r.logical ?? 0), 0),
    freedBytes: freed,
    measuredBytes: result.measured,
    items: result.removed.slice(0, 100).map((r) => r.label),
  });
  return s.cleanups.at(-1);
}

/** For doctor and deliver: the default inventory and the --all one, measured in one pass. */
export async function reclaimable(project) {
  const cur = await inventory(project, { measure: false });
  const all = await inventory(project, { all: true, measure: false });
  const res = usageOf([...new Set([...cur.rows, ...all.rows].flatMap((r) => r.paths))]);
  for (const inv of [cur, all]) {
    measureRows(inv, res);
    inv.totals = totalsOf(inv.rows);
  }
  return { now: cur, all };
}
