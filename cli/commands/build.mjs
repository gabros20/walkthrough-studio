// walkthrough build [--dry] [--audit] [--no-captions] [--aspect a] [--fit-audio f] [--brand f] [--takes d]: the film build.
import { num, parseArgs } from "../lib/args.mjs";
import { runBuild } from "../lib/film.mjs";
import { requireProject } from "../lib/project.mjs";

const usage = `walkthrough build [storyboard.json] [--dry] [--audit] [--no-captions] [--aspect 16:9|9:16|1:1]
                 [--fit-audio <placement.json> [--fit-gap <s>] [--fit-max <s>]] [--brand <file>] [--takes <dir>] [build flags]

Runs node <kit>/film/build.mjs <project>/storyboard.json --project <project> --takes <takes> [flags]
in the project (takes: --takes, else the config's takesDir, else <project>/takes). Other flags
(--no-cut, --dry-out <dir>, ...) pass through; see film/README.md.
  --dry           durations table only, no files written
  --audit         then audit: holds, pointer jumps at cuts, dead air, caption lint, claims
  --no-captions   the voiceover twin: identical picture, captions track not mounted
  --aspect        the canvas (else FILM_ASPECT, the storyboard's look.aspect, the brand's, else 16:9)
  --fit-audio     script-first timing on this voice placement (else the storyboard's fitAudio);
                  --fit-gap / --fit-max tune it (0.3 s, 6 s)
  --placeholders  stand-in creatives for the title and end cards when the project lists none
Relative --brand, --takes and --fit-audio paths are taken from the current directory.
Before a real (not --dry) build, missing asset manifests are made first: node <kit>/film/scripts/sync-assets.mjs
when there is a creatives.json or a brand logo to sync; else it stops with the hint (or --placeholders).
Each run is appended to state.builds: { at, dry, storyboardHash, captions, aspect, brand: { file, hash },
takes, fitAudio: { file, hash, gap, max } | null, audit: { errors, warnings }, exit } (the audit counts are
parsed from the audit's last line; render compares the inputs with the last full build's). Exit code: the build's.`;

export default {
  name: "build",
  describe: "build the film compositions (film/build.mjs); records the build in state.json",
  usage,
  async run(argv, ctx) {
    requireProject(ctx);
    const { opts, positional, unknown } = parseArgs(argv, { boolean: ["dry", "audit", "captions", "placeholders"], string: ["brand", "takes", "aspect", "fit-audio", "fit-gap", "fit-max"] });
    if (opts["fit-gap"] !== undefined) num(opts["fit-gap"], "fit-gap");
    if (opts["fit-max"] !== undefined) num(opts["fit-max"], "fit-max");
    const { code, entry } = await runBuild(ctx, {
      storyboard: positional.find((p) => p.endsWith(".json")),
      takes: opts.takes,
      brand: opts.brand,
      aspect: opts.aspect,
      fitAudio: opts["fit-audio"],
      fitGap: opts["fit-gap"],
      fitMax: opts["fit-max"],
      dry: Boolean(opts.dry),
      audit: Boolean(opts.audit),
      noCaptions: opts.captions === false,
      placeholders: Boolean(opts.placeholders),
      extra: unknown,
    });
    ctx.log.info(`build recorded: ${entry.dry ? "dry, " : ""}aspect ${entry.aspect}, captions ${entry.captions ? "on" : "off"}${entry.fitAudio ? `, fit-audio ${entry.fitAudio.file}` : ""}${entry.audit ? `, audit ${entry.audit.errors} error(s) ${entry.audit.warnings} warning(s)` : ""}, exit ${code}`);
    return code;
  },
};
