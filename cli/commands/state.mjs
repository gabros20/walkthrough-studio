// walkthrough state [--json] | state lock | state unlock: the project's state.json.
import { parseArgs } from "../lib/args.mjs";
import { requireProject } from "../lib/project.mjs";
import { now, sha256File, STATE_SCHEMA } from "../lib/state.mjs";
import { fmtDate, fmtSeconds, printTable } from "../lib/table.mjs";

const usage = `walkthrough state [--json]
walkthrough state lock | unlock

Prints the project state (schema ${STATE_SCHEMA}; docs/CLI.md has the full shape): takes, checkpoints,
picture lock, tour map, captions, builds, renders, reviews, sound, voiceover, deliveries, disk spills
and the cost ledger.
  --json   the raw state.json
  lock     picture lock: records the storyboard's sha256 (later builds warn when it changes)
  unlock   clears the picture lock`;

const short = (h) => (h ? h.slice(0, 10) : "");

export default {
  name: "state",
  describe: "print the project state (takes, builds, renders, costs); lock/unlock the picture",
  usage,
  async run(argv, ctx) {
    const project = requireProject(ctx);
    const { opts, positional } = parseArgs(argv, { boolean: ["json"] });
    const s = project.state;
    if (positional[0] === "lock") {
      const hash = sha256File(project.paths.storyboard);
      if (!hash) {
        ctx.log.error("no storyboard.json to lock");
        return 1;
      }
      s.pictureLock = { hash, at: now() };
      project.save();
      ctx.log.info(`picture locked at storyboard ${short(hash)}`);
      return 0;
    }
    if (positional[0] === "unlock") {
      s.pictureLock = null;
      project.save();
      ctx.log.info("picture lock cleared");
      return 0;
    }
    if (positional[0]) {
      ctx.log.error(`unknown state action "${positional[0]}"\n\n${usage}`);
      return 2;
    }
    if (opts.json) {
      console.log(JSON.stringify(s, null, 2));
      return 0;
    }
    const h = (t) => console.log(`\n${t}`);
    console.log(`project ${project.dir}\nname ${s.name ?? ""}, mode ${s.mode ?? "?"}, state.json ${project.hasStateFile ? `updated ${fmtDate(s.updatedAt)}` : "not written yet"}`);
    console.log(`picture lock: ${s.pictureLock ? `${short(s.pictureLock.hash)} at ${fmtDate(s.pictureLock.at)}` : "none"}; current checkpoint: ${s.currentCheckpoint ? s.currentCheckpoint.name : "none"}`);
    if (s.tourMap) console.log(`tour map: ${s.tourMap.pages} page(s), ${s.tourMap.controls} control(s) from ${s.tourMap.startUrl} at ${fmtDate(s.tourMap.at)}`);
    if (s.captions) console.log(`captions: brief ${s.captions.briefAt ? `${fmtDate(s.captions.briefAt)} (${s.captions.count})` : "none"}, applied ${s.captions.appliedAt ? `${fmtDate(s.captions.appliedAt)} (${s.captions.applied ?? 0})` : "not yet"}`);
    h("takes");
    printTable(Object.entries(s.takes).map(([name, t]) => ({ take: name, recorded: fmtDate(t.recordedAt), ok: t.ok, accepted: t.accepted, sync: t.masterSync, "gap out ms": t.gaps?.outsideWaitsMs ?? null, duration: t.duration == null ? null : Math.round(t.duration * 100) / 100, checkpoint: t.checkpoint ?? "" })));
    if (s.checkpoints.length) {
      h("checkpoints");
      printTable(s.checkpoints.map((c) => ({ name: c.name, at: fmtDate(c.at), by: c.by, after: c.after ?? "" })));
    }
    h("builds (last 5)");
    printTable(s.builds.slice(-5).map((b) => ({ at: fmtDate(b.at), dry: b.dry, storyboard: short(b.storyboardHash), aspect: b.aspect ?? null, captions: b.captions, fit: b.fitAudio ? "on" : b.fitAudio === null ? "off" : null, errors: b.audit?.errors ?? null, warnings: b.audit?.warnings ?? null, exit: b.exit })));
    h("renders");
    printTable(s.renders.map((r) => ({ name: r.name, file: r.file, at: fmtDate(r.at), duration: fmtSeconds(r.duration), fps: r.fps, captions: r.captions, spill: r.spill ?? "" })));
    if (s.reviews?.length) {
      h("reviews (last 5)");
      printTable(s.reviews.slice(-5).map((r) => ({ render: r.render, out: r.out, at: fmtDate(r.at), errors: r.audit?.errors ?? null, warnings: r.audit?.warnings ?? null, holds: r.holds ?? null })));
    }
    for (const key of ["sound", "voiceover", "deliveries"]) {
      if (!s[key]?.length) continue;
      h(key);
      printTable(s[key].slice(-5).map((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => typeof v !== "object" || v === null).slice(0, 7))));
    }
    if (s.spills.length) {
      h("disk spills");
      printTable(s.spills.map((x) => ({ at: fmtDate(x.at), step: x.step, to: x.to })));
    }
    h("costs");
    const byKind = {};
    for (const c of s.costs) {
      const k = (byKind[c.kind] ??= { kind: c.kind, rows: 0, units: 0, amount: 0 });
      k.rows++;
      k.units = Math.round((k.units + c.units) * 100) / 100;
      k.amount = Math.round((k.amount + (c.amount ?? 0)) * 100) / 100;
    }
    printTable(Object.values(byKind));
    if (s.doctor) console.log(`\ndoctor: ${s.doctor.fails} fail(s), ${s.doctor.warns} warning(s) at ${fmtDate(s.doctor.at)}`);
    return 0;
  },
};
