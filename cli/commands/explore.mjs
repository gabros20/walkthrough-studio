// walkthrough explore [url] [--depth 2] [--max-pages 20] [--storage <state.json>] [--viewport desktop|phone]:
// the recorder's tour map (recorder/tools/explore.mjs), written into the project folder.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "../lib/args.mjs";
import { CliError, kitPath, resolvedConfig } from "../lib/project.mjs";
import { now, rel } from "../lib/state.mjs";

const usage = `walkthrough explore [url] [--depth 2] [--max-pages 20] [--storage <state.json>] [--viewport desktop|phone]
                    [--out <dir>] [--delay 300] [--ignore-robots]

Runs node <kit>/recorder/tools/explore.mjs <url> --config <project>/walkthrough.config.mjs --out <project> [flags].
Crawls same-site links breadth-first from <url> (default: the config's baseUrl), one page at a time with
--delay ms between pages; never clicks, types or submits; honours robots.txt and the config's viewport,
storageState, blockUrls and dismiss. Writes into the project folder (or the current folder outside a project):
  tour-map.json       schema walkthrough-tour-map/1: per page url, title, landmarks, h1-h3, up to 80
                      interactive controls from the accessibility tree (role, name, box, text, href)
  tour-map.md         the same, one section per page with a controls table
  thumbs/<n>.jpg      480 px wide thumbnails
  scenes.draft.json   one declarative scene per page; edit it into scenes.json (destructive-sounding
                      controls are listed under _skipped, never clicked)
Inside a project the run is recorded in state.json as tourMap: { at, startUrl, pages, controls, skipped, file }.`;

export default {
  name: "explore",
  describe: "tour map of a site: pages, controls, thumbnails and drafted scenes",
  usage,
  async run(argv, ctx) {
    const { opts, positional, unknown } = parseArgs(argv, {
      boolean: ["ignore-robots"],
      string: ["depth", "max-pages", "storage", "viewport", "out", "delay", "config"],
    });
    if (unknown.length) throw new CliError(`explore: unknown option ${unknown[0]}\n\n${usage}`, 2);
    if (positional.length > 1) throw new CliError(`explore: one URL at most\n\n${usage}`, 2);
    const project = ctx.project;
    const configFile = opts.config ? resolve(opts.config) : project?.configFile && existsSync(project.configFile) ? project.configFile : null;
    // Without a URL, explore.mjs starts at the config's baseUrl.
    const url = positional[0] ?? null;
    if (!url && !configFile) throw new CliError(`explore: give a URL (no walkthrough.config.mjs here to take a baseUrl from)\n\n${usage}`, 2);
    if (configFile === project?.configFile && project && !(await resolvedConfig(project)))
      throw new CliError(`explore: walkthrough.config.mjs does not load: ${project.configError?.message ?? "unknown error"}`);
    const args = [kitPath("recorder/tools/explore.mjs")];
    if (url) args.push(url);
    if (configFile) args.push("--config", configFile);
    const out = resolve(opts.out ?? project?.dir ?? process.cwd());
    args.push("--out", out);
    for (const k of ["depth", "max-pages", "storage", "viewport", "delay"]) if (opts[k] !== undefined) args.push(`--${k}`, k === "storage" ? resolve(opts[k]) : opts[k]);
    if (opts["ignore-robots"]) args.push("--ignore-robots");
    const r = await ctx.exec(process.execPath, args);
    const mapFile = join(out, "tour-map.json");
    if (r.code === 0 && project && existsSync(mapFile)) {
      try {
        const doc = JSON.parse(readFileSync(mapFile, "utf8"));
        project.state.tourMap = {
          at: now(),
          startUrl: doc.startUrl,
          pages: doc.pages.length,
          controls: doc.pages.reduce((a, p) => a + p.controls.length, 0),
          skipped: doc.skipped.length,
          file: rel(project.dir, mapFile),
        };
        project.save();
        ctx.log.info(`recorded in state.json: tourMap (${doc.pages.length} pages)`);
      } catch (err) {
        ctx.log.warn(`tour-map.json not recorded in state.json: ${err.message}`);
      }
    }
    return r.code;
  },
};
