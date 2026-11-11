// walkthrough clean [--dry] [--all] [--keep-checkpoints N] [--keep-takes accepted|all] [--yes]: list
// what the project leaves on disk that it no longer needs (logical and on-disk sizes), then remove it.
import { createInterface } from "node:readline";
import { num, parseArgs } from "../lib/args.mjs";
import { inventory, POLICY, printInventory, recordCleanup, removeRows } from "../lib/clean.mjs";
import { CliError, requireProject } from "../lib/project.mjs";
import { fmtBytes } from "../lib/table.mjs";

const usage = `walkthrough clean [--dry] [--all] [--keep-checkpoints N] [--keep-takes accepted|all] [--yes]

Lists every reclaimable item of the project, its studio root (checkpoints) and its buffer folder
(<buffer>/<project name>/, where the disk policy spilled), with its logical size (Finder, du) and
its size on disk (APFS clones counted once: python3 -I <kit>/cli/lib/disk-usage.py), and what
happens to it (remove / keep / refuse) and why. Then asks before removing (--yes: no question).
Default policy:
${POLICY.map((l) => `  ${l}`).join("\n")}
  --dry                 print the table only
  --all                 after the client accepts the film: every checkpoint, raw/ of every take, the
                        buffer folders, capture tests, sound-build/bed.wav
  --keep-checkpoints N  newest checkpoints to keep (default 1; the current one is always kept)
  --keep-takes all      keep rejected takes too (default accepted: rejected take folders go)
  --yes                 remove without asking (agents)
Never touches anything outside the project, the studio root and the buffer folder: a path that
resolves elsewhere (a symlink, a state.spills entry) is listed as "refuse". Each run is appended to
state.cleanups { at, all, removed, logical, freedBytes, measuredBytes (df before/after), items }.
Exit code: 0, or 1 when the answer was no or a removal failed.`;

async function ask(question) {
  if (!process.stdin.isTTY) {
    // piped answer (or none): read one line
    const rl = createInterface({ input: process.stdin });
    process.stdout.write(question);
    for await (const line of rl) {
      rl.close();
      console.log(line);
      return line;
    }
    console.log("");
    return "";
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((done) =>
    rl.question(question, (a) => {
      rl.close();
      done(a);
    }),
  );
}

export default {
  name: "clean",
  describe: "list and remove what the project no longer needs: checkpoints, raw frames, caches, drafts",
  usage,
  async run(argv, ctx) {
    const project = requireProject(ctx);
    const { opts, positional, unknown } = parseArgs(argv, { boolean: ["dry", "all", "yes"], string: ["keep-checkpoints", "keep-takes"] });
    if (unknown.length || positional.length) throw new CliError(`clean: unknown argument(s) ${[...unknown, ...positional].join(" ")}\n\n${usage}`, 2);
    const keepCheckpoints = opts["keep-checkpoints"] === undefined ? 1 : num(opts["keep-checkpoints"], "keep-checkpoints");
    if (!Number.isInteger(keepCheckpoints) || keepCheckpoints < 0) throw new CliError("--keep-checkpoints must be a whole number >= 0", 2);
    const keepTakes = opts["keep-takes"] ?? "accepted";
    if (!["accepted", "all"].includes(keepTakes)) throw new CliError(`--keep-takes must be accepted or all (got "${keepTakes}")`, 2);

    const inv = await inventory(project, { all: Boolean(opts.all), keepCheckpoints, keepTakes });
    printInventory(inv, { title: `clean${opts.all ? " --all" : ""}${opts.dry ? " (dry run)" : ""}: ${project.dir}\n` });
    const t = inv.totals;
    if (opts.dry) {
      if (t.remove.count) ctx.log.info(`\ndry run: nothing removed. To remove: walkthrough clean${opts.all ? " --all" : ""} --yes`);
      return 0;
    }
    if (!t.remove.count) {
      ctx.log.info("\nnothing to remove");
      return 0;
    }
    if (!opts.yes) {
      const a = await ask(`\nremove ${t.remove.count} item(s), freeing about ${fmtBytes(t.remove.onDisk)}? [y/N] `);
      if (!/^y(es)?$/i.test(a.trim())) {
        ctx.log.info("nothing removed");
        return 1;
      }
    }
    const result = removeRows(ctx, inv);
    const entry = recordCleanup(project, inv, result);
    project.save();
    for (const f of result.failed) ctx.log.warn(`${f.row.label}: ${f.error}`);
    ctx.log.info(
      `\nremoved ${result.removed.length} item(s): logical ${fmtBytes(entry.logical)}, about ${fmtBytes(entry.freedBytes)} on disk (free space went up ${fmtBytes(result.measured)} by df); recorded in state.cleanups`,
    );
    return result.failed.length ? 1 : 0;
  },
};
