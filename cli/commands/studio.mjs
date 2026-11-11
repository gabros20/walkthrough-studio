// walkthrough studio up|down|checkpoint <name> [--keep N]|restore <name>|prune [--keep N] [--dry]|status|tree [--build]|paths
import { existsSync } from "node:fs";
import { num } from "../lib/args.mjs";
import { studioPaths } from "../lib/clean.mjs";
import { freeBytes } from "../lib/disk.mjs";
import { CliError, kitPath, requireProject, resolvedConfig } from "../lib/project.mjs";
import { now } from "../lib/state.mjs";
import { fmtBytes } from "../lib/table.mjs";

const usage = `walkthrough studio <up|down|checkpoint <name> [--keep N]|restore <name>|prune [--keep N] [--dry]|status|tree [--build]|paths>

Runs the kit's studio scripts with the project's studio config:
  STUDIO_CONFIG=<project studio config> bash <kit>/studio/bin/<script>.sh [args]
  up / down             start / stop the studio services (safe to repeat)
  checkpoint <name>     clone every data dir into checkpoints/<name>   (recorded in state.checkpoints)
    --keep N            then prune older checkpoints to the newest N (this one included)
  restore <name>        replace the data with the checkpoint, bring the stack up (state.currentCheckpoint)
  prune [--keep N]      remove checkpoints but the newest N (default 1), the current one (last restored,
        [--dry]         state.currentCheckpoint) and one named in state.pictureLock; --dry lists only.
                        Prints free space on the studio volume before and after; state.cleanups
  status                pids, ports, health, checkpoints on disk (newest first)
  tree [--build]        fresh copy of the source repo (+ production build)
  paths                 resolved paths as KEY=value lines
Checkpoints are APFS clones: Finder shows each at full size, but they share blocks, so
\`walkthrough clean --dry\` shows what they really cost on disk. They are disposable once the film
is accepted (\`walkthrough clean --all\` removes them all).
The studio config is walkthrough.config.mjs studio.config (made by \`walkthrough init --mode studio\`).
Site-mode projects have none; the studio is for an app you own and run locally (studio/README.md).`;

const SCRIPTS = { up: "up", down: "down", checkpoint: "checkpoint", restore: "restore", prune: "prune", status: "status", tree: "tree", paths: "paths" };

/** --keep N / --keep=N and --dry out of the args; the rest stays. */
function takeFlags(args) {
  const rest = [];
  let keep;
  let dry = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--keep") keep = num(args[++i], "keep");
    else if (a.startsWith("--keep=")) keep = num(a.slice(7), "keep");
    else if (a === "--dry") dry = true;
    else rest.push(a);
  }
  if (keep !== undefined && (!Number.isInteger(keep) || keep < 0)) throw new CliError("--keep must be a whole number >= 0", 2);
  return { keep, dry, rest };
}

export default {
  name: "studio",
  describe: "studio instance: up, down, checkpoint <name> [--keep N], restore <name>, prune, status, tree, paths",
  usage,
  async run(argv, ctx) {
    const [sub, ...args] = argv;
    if (!sub || !SCRIPTS[sub]) throw new CliError(`studio: say what to do\n\n${usage}`, 2);
    const { keep, dry, rest } = sub === "checkpoint" || sub === "prune" ? takeFlags(args) : { rest: args };
    if ((sub === "checkpoint" || sub === "restore") && !rest[0]) throw new CliError(`studio ${sub} needs a checkpoint name (e.g. CP0)`, 2);
    if (sub === "checkpoint" && keep === 0) throw new CliError("studio checkpoint --keep must be >= 1 (the new checkpoint is always kept)", 2);
    const project = requireProject(ctx);
    const c = await resolvedConfig(project);
    const cfg = c?.studio?.config;
    if (!cfg)
      throw new CliError(
        `this project has no studio config: add studio: { bin: "${kitPath("studio/bin")}", config: "./studio.config.sh" } to walkthrough.config.mjs and copy ${kitPath("studio/studio.config.example.sh")} to studio.config.sh (or start the project with \`walkthrough init <dir> --mode studio\`)`,
        2,
      );
    if (!existsSync(cfg)) throw new CliError(`studio config ${cfg} not found (copy ${kitPath("studio/studio.config.example.sh")} there and fill it in)`, 2);

    // the checkpoints state.json names are never pruned
    const protect = [project.state.currentCheckpoint?.name, project.state.pictureLock?.checkpoint].filter(Boolean);
    const scriptArgs = [...rest];
    if (keep !== undefined) scriptArgs.push("--keep", String(keep));
    if (sub === "prune" && dry) scriptArgs.push("--dry");
    if (keep !== undefined || sub === "prune") for (const p of protect) scriptArgs.push("--protect", p);

    const pruning = (sub === "prune" && !dry) || (sub === "checkpoint" && keep !== undefined);
    const paths = pruning ? await studioPaths(project) : null;
    const before = paths?.checkpoints ? freeBytes(paths.checkpoints) : null;
    const r = await ctx.exec("bash", [kitPath(`studio/bin/${SCRIPTS[sub]}.sh`), ...scriptArgs], { env: { STUDIO_CONFIG: cfg }, cwd: project.dir });
    if (r.code === 0 && sub === "checkpoint") project.state.checkpoints.push({ name: rest[0], at: now(), by: "studio" });
    if (r.code === 0 && sub === "restore") project.state.currentCheckpoint = { name: rest[0], at: now() };
    const removed = [...r.stdout.matchAll(/^removed (\S+)$/gm)].map((m) => m[1]);
    if (removed.length) {
      const at = now();
      for (const e of project.state.checkpoints) if (removed.includes(e.name) && !e.removedAt) e.removedAt = at;
      const after = paths?.checkpoints ? freeBytes(paths.checkpoints) : null;
      const measured = before && after ? Math.max(0, after.free - before.free) : null;
      (project.state.cleanups ??= []).push({ at, by: `studio ${sub}`, keepCheckpoints: keep ?? 1, removed: removed.length, measuredBytes: measured, items: removed.map((n) => `<studio>/checkpoints/${n}`) });
      ctx.log.info(`studio ${sub}: removed ${removed.length} checkpoint(s)${measured !== null ? `; free space on the studio volume ${fmtBytes(before.free)} -> ${fmtBytes(after.free)}` : ""}; recorded in state.cleanups`);
    }
    if (r.code === 0 && (sub === "checkpoint" || sub === "restore" || removed.length)) project.save();
    return r.code;
  },
};
