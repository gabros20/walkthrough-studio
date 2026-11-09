// walkthrough studio up|down|checkpoint <name>|restore <name>|status|tree [--build]|paths
import { existsSync } from "node:fs";
import { CliError, kitPath, requireProject, resolvedConfig } from "../lib/project.mjs";
import { now } from "../lib/state.mjs";

const usage = `walkthrough studio <up|down|checkpoint <name>|restore <name>|status|tree [--build]|paths>

Runs the kit's studio scripts with the project's studio config:
  STUDIO_CONFIG=<project studio config> bash <kit>/studio/bin/<script>.sh [args]
  up / down             start / stop the studio services (safe to repeat)
  checkpoint <name>     clone every data dir into checkpoints/<name>   (recorded in state.checkpoints)
  restore <name>        replace the data with the checkpoint, bring the stack up (state.currentCheckpoint)
  status                pids, ports, health, checkpoints on disk
  tree [--build]        fresh copy of the source repo (+ production build)
  paths                 resolved paths as KEY=value lines
The studio config is walkthrough.config.mjs studio.config (made by \`walkthrough init --mode studio\`).
Site-mode projects have none; the studio is for an app you own and run locally (studio/README.md).`;

const SCRIPTS = { up: "up", down: "down", checkpoint: "checkpoint", restore: "restore", status: "status", tree: "tree", paths: "paths" };

export default {
  name: "studio",
  describe: "studio instance: up, down, checkpoint <name>, restore <name>, status, tree, paths",
  usage,
  async run(argv, ctx) {
    const [sub, ...rest] = argv;
    if (!sub || !SCRIPTS[sub]) throw new CliError(`studio: say what to do\n\n${usage}`, 2);
    if ((sub === "checkpoint" || sub === "restore") && !rest[0]) throw new CliError(`studio ${sub} needs a checkpoint name (e.g. CP0)`, 2);
    const project = requireProject(ctx);
    const c = await resolvedConfig(project);
    const cfg = c?.studio?.config;
    if (!cfg)
      throw new CliError(
        `this project has no studio config: add studio: { bin: "${kitPath("studio/bin")}", config: "./studio.config.sh" } to walkthrough.config.mjs and copy ${kitPath("studio/studio.config.example.sh")} to studio.config.sh (or start the project with \`walkthrough init <dir> --mode studio\`)`,
        2,
      );
    if (!existsSync(cfg)) throw new CliError(`studio config ${cfg} not found (copy ${kitPath("studio/studio.config.example.sh")} there and fill it in)`, 2);
    const r = await ctx.exec("bash", [kitPath(`studio/bin/${SCRIPTS[sub]}.sh`), ...rest], { env: { STUDIO_CONFIG: cfg }, cwd: project.dir });
    if (r.code === 0 && sub === "checkpoint") {
      project.state.checkpoints.push({ name: rest[0], at: now(), by: "studio" });
      project.save();
    }
    if (r.code === 0 && sub === "restore") {
      project.state.currentCheckpoint = { name: rest[0], at: now() };
      project.save();
    }
    return r.code;
  },
};
