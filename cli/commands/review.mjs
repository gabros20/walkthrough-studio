// walkthrough review [--render final | renders/x.mp4] [--out dir] [bundle flags]: the review bundle and
// the static review page for one render (film/scripts/review-bundle.mjs), recorded in state.reviews.
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "../lib/args.mjs";
import { CliError, kitPath, requireProject, takesDirOf } from "../lib/project.mjs";
import { now, rel } from "../lib/state.mjs";

const usage = `walkthrough review [--render final | <renders/name.mp4>] [--out <dir>] [--takes <dir>] [bundle flags]

Runs node <kit>/film/scripts/review-bundle.mjs <project>/renders/<name>.mp4 --project <project>
--out <project>/review/<name> --takes <takes> --state <project>/state.json in the project, which writes
into the out folder: REVIEW.md, index.html (the static review page: open it in a browser, no server),
audit.md/.json, holds.md, audio.md, costs.md, sheets/<scene>.jpg, cuts/<nn>-<t>.jpg, bundle.json
(docs/REVIEW.md). The render's sidecars (renders/<name>.cues.json, .edl.json, .captions.srt) must
be beside it; \`walkthrough render\` copies them.
  --render <name>    the render to review (default: the last one in state.renders, else "final");
                     a path to an .mp4 works too
  --out <dir>        the bundle folder (default <project>/review/<name>)
Other flags pass through: --storyboard <f>, --sound-build <dir>, --placement <f>, --fps-sheet <n>,
--width <px>, --hold <s>, --labels auto|drawtext|pillow|none.
Appends { render, out, at, audit: { errors, warnings }, holds, labels } to state.reviews.
Exit code: the bundle's (0 when it is written, whatever the findings).`;

export default {
  name: "review",
  describe: "review bundle for a render: sheets, cut strips, audit, holds, audio, costs, REVIEW.md, review page",
  usage,
  async run(argv, ctx) {
    const project = requireProject(ctx);
    const P = project.dir;
    const { opts, positional, unknown } = parseArgs(argv, { string: ["render", "out", "takes", "state"] });
    const given = opts.render ?? positional.find((p) => p.endsWith(".mp4")) ?? project.state.renders?.at(-1)?.name ?? "final";
    const file = given.endsWith(".mp4") ? (isAbsolute(given) ? given : resolve(given)) : join(P, "renders", `${given}.mp4`);
    if (!existsSync(file)) throw new CliError(`no render at ${file}: render first (\`walkthrough render --name ${given.replace(/\.mp4$/, "")}\`) or pass --render <name>`);
    const name = file.split("/").pop().replace(/\.mp4$/i, "").replace(/\.picture-only$/, "");
    const out = opts.out ? resolve(opts.out) : join(P, "review", name);
    const takes = opts.takes ? resolve(opts.takes) : await takesDirOf(project);
    const args = [kitPath("film/scripts/review-bundle.mjs"), file, "--project", P, "--out", out];
    if (existsSync(takes)) args.push("--takes", takes);
    const statePath = opts.state ? resolve(opts.state) : project.paths.state;
    if (existsSync(statePath)) args.push("--state", statePath);
    args.push(...unknown);
    const r = await ctx.exec(process.execPath, args, { cwd: P });
    if (r.code !== 0) return r.code;
    let bundle = null;
    try {
      bundle = JSON.parse(readFileSync(join(out, "bundle.json"), "utf8"));
    } catch {
      ctx.log.warn(`${join(out, "bundle.json")} not readable: the review is not recorded in state.json`);
      return r.code;
    }
    const entry = { render: rel(P, file), out: rel(P, out), at: now(), audit: bundle.audit ? { errors: bundle.audit.errors, warnings: bundle.audit.warnings } : null, holds: bundle.holds, labels: bundle.labels };
    (project.state.reviews ??= []).push(entry);
    project.save();
    ctx.log.info(
      `\nreview recorded: ${entry.out}/ (open ${entry.out}/index.html in a browser)${entry.audit ? `; audit ${entry.audit.errors} error(s), ${entry.audit.warnings} warning(s)` : "; audit did not run"}${entry.holds !== null ? `, ${entry.holds} hold(s)` : ""}`,
    );
    return 0;
  },
};
