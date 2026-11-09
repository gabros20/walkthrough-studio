// walkthrough draft [takes…] [--out f]: first-pass storyboard from the project's takes.
import { existsSync, readdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "../lib/args.mjs";
import { CliError, kitPath, requireProject, takesDirOf } from "../lib/project.mjs";

const usage = `walkthrough draft [take ...] [--out <file>]

Runs node <kit>/film/scripts/draft-storyboard.mjs <take dirs ...> --out <file> in the project.
  take    take folder names (in <takes>) or paths; default: the accepted takes in state.json, else
          every take folder with an events.json (not _-prefixed), in natural name order
  --out   default storyboard.json when the project has none, else storyboard.draft.json, so a
          refined storyboard is never overwritten unless you name it
One scene per take, agent waits as time-lapses, a framing and a TODO caption per click (film/README.md).`;

export default {
  name: "draft",
  describe: "first-pass storyboard from the takes (film/scripts/draft-storyboard.mjs)",
  usage,
  async run(argv, ctx) {
    const project = requireProject(ctx);
    const { opts, positional, unknown } = parseArgs(argv, { string: ["out", "take"] });
    const takesDir = await takesDirOf(project);
    const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });
    let names = positional;
    if (!names.length) {
      const accepted = Object.entries(project.state.takes).filter(([, t]) => t.accepted).map(([n]) => n);
      names = accepted.length ? accepted : existsSync(takesDir) ? readdirSync(takesDir).filter((d) => !d.startsWith("_") && existsSync(join(takesDir, d, "events.json"))) : [];
      names.sort(natural);
      if (!names.length) throw new CliError(`no takes in ${takesDir}: record some with \`walkthrough take\``);
    }
    const dirs = names.map((n) => {
      const asPath = isAbsolute(n) ? n : resolve(n);
      if (existsSync(join(asPath, "events.json")) || (n.endsWith(".json") && existsSync(asPath))) return asPath;
      const inTakes = join(takesDir, n);
      if (existsSync(join(inTakes, "events.json"))) return inTakes;
      throw new CliError(`take "${n}" not found (looked in ${takesDir})`);
    });
    const out = opts.out ? resolve(opts.out) : existsSync(project.paths.storyboard) ? join(project.dir, "storyboard.draft.json") : project.paths.storyboard;
    if (!opts.out && out !== project.paths.storyboard) ctx.log.info(`storyboard.json exists; drafting to ${out} (pass --out storyboard.json to replace it)`);
    const args = [kitPath("film/scripts/draft-storyboard.mjs"), ...dirs, "--out", out, ...(opts.take ? ["--take", opts.take] : []), ...unknown];
    const r = await ctx.exec(process.execPath, args, { cwd: project.dir });
    return r.code;
  },
};
