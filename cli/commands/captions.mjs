// walkthrough captions brief|apply: film/scripts/draft-captions.mjs in the project (docs/CAPTIONS.md).
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "../lib/args.mjs";
import { storyboardOf } from "../lib/film.mjs";
import { CliError, kitPath, requireProject, takesDirOf } from "../lib/project.mjs";
import { now } from "../lib/state.mjs";

const usage = `walkthrough captions brief [storyboard.json] [--all] [--voice] [--takes <dir>] [--out f] [--json f]
walkthrough captions apply [captions.answers.json] [storyboard.json] [--force] [--out f] [--takes <dir>]

The tool prepares and checks; an agent writes the words (docs/CAPTIONS.md).
  brief   node <kit>/film/scripts/draft-captions.mjs brief <storyboard> --takes <takes> --project <p>
          writes captions.brief.md / .json beside the storyboard (and a blank captions.answers.json
          when there is none): per TODO caption (--all: every caption) the scene intent, anchor, click,
          marks and their text, the next events, the window in film seconds, the most words that fit,
          a claim candidate; --voice adds each scene's voice window and words at 2.6 words/s
  apply   node <kit>/film/scripts/draft-captions.mjs apply <answers> <storyboard> --takes <takes> --project <p>
          writes the answers into the storyboard (keeps <storyboard>.bak), sets "claims" for quoted UI
          text, refuses answers over 10 words or over the window (--force), prints the caption lint
Records state.captions { briefAt, appliedAt, count, applied }. Then: walkthrough build --dry --audit.`;

export default {
  name: "captions",
  describe: "caption brief for the agent, then apply its answers to the storyboard (draft-captions.mjs)",
  usage,
  async run(argv, ctx) {
    const project = requireProject(ctx);
    const [action, ...rest] = argv;
    if (!["brief", "apply"].includes(action)) throw new CliError(`captions: say brief or apply\n\n${usage}`, 2);
    const STRINGS = ["out", "json", "answers", "wps", "brand"];
    const { opts, positional, unknown } = parseArgs(rest, { boolean: ["all", "voice", "force"], string: ["takes", ...STRINGS] });
    const takes = opts.takes ? resolve(opts.takes) : await takesDirOf(project);
    const tool = kitPath("film/scripts/draft-captions.mjs");
    let args;
    if (action === "brief") {
      const sb = storyboardOf(project, positional.find((p) => p.endsWith(".json")));
      args = [tool, "brief", sb];
    } else {
      const jsons = positional.filter((p) => p.endsWith(".json"));
      const answers = resolve(jsons[0] ?? join(project.dir, "captions.answers.json"));
      if (!existsSync(answers)) throw new CliError(`no answers at ${answers}: run \`walkthrough captions brief\` and fill captions.answers.json first`);
      const sb = storyboardOf(project, jsons[1]);
      args = [tool, "apply", answers, sb];
    }
    for (const k of ["all", "voice", "force"]) if (opts[k]) args.push(`--${k}`);
    for (const k of STRINGS) if (opts[k] != null) args.push(`--${k}`, k === "wps" ? opts[k] : resolve(opts[k]));
    args.push("--takes", takes, "--project", project.dir, ...unknown);
    const r = await ctx.exec(process.execPath, args, { cwd: project.dir });
    if (r.code === 0) {
      const c = (project.state.captions ??= { briefAt: null, appliedAt: null, count: 0 });
      if (action === "brief") {
        c.briefAt = now();
        c.count = Number(/brief: (\d+) caption/.exec(r.stdout)?.[1] ?? 0);
      } else {
        c.appliedAt = now();
        c.applied = Number(/captions: applied (\d+)/.exec(r.stdout)?.[1] ?? 0);
      }
      project.save();
    }
    return r.code;
  },
};
