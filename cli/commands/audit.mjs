// walkthrough audit [flags]: film/scripts/audit.mjs on the project's last build.
import { parseArgs } from "../lib/args.mjs";
import { parseAuditLine, storyboardOf } from "../lib/film.mjs";
import { kitPath, requireProject, takesDirOf } from "../lib/project.mjs";
import { now } from "../lib/state.mjs";

const usage = `walkthrough audit [storyboard.json] [--takes <dir>] [audit flags]

Runs node <kit>/film/scripts/audit.mjs <storyboard> --project <project> --takes <takes> [flags] in the
project, on the files the last build wrote (edl.json, cues.json, captions.srt). Flags pass through:
--hold s, --jump px, --tail s, --no-holds, --json, --edl/--cues/--srt <file> (film/README.md, Scripts).
The counts go to state.lastAudit. Exit 1 on errors (the audit's own exit code).`;

export default {
  name: "audit",
  describe: "audit the last build: holds, pointer jumps, dead air, captions, claims",
  usage,
  async run(argv, ctx) {
    const project = requireProject(ctx);
    const { opts, positional, unknown } = parseArgs(argv, { string: ["takes"] });
    const sb = storyboardOf(project, positional.find((p) => p.endsWith(".json")));
    const takes = opts.takes ?? (await takesDirOf(project));
    const r = await ctx.exec(process.execPath, [kitPath("film/scripts/audit.mjs"), sb, "--project", project.dir, "--takes", takes, ...unknown], { cwd: project.dir });
    let counts = parseAuditLine(r.stdout);
    if (!counts && unknown.includes("--json")) {
      try {
        const j = JSON.parse(r.stdout);
        counts = { errors: j.errors, warnings: j.warnings };
      } catch {}
    }
    if (counts) {
      project.state.lastAudit = { at: now(), ...counts, exit: r.code };
      project.save();
    }
    return r.code;
  },
};
