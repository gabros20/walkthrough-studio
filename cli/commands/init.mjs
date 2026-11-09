// walkthrough init <dir>: scaffold a project folder (docs/DESIGN-batch-2.md §1, docs/CLI.md).
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "../lib/args.mjs";
import { CliError, insideKit, kitPath, KIT_ROOT } from "../lib/project.mjs";
import { emptyState, writeState } from "../lib/state.mjs";

const usage = `walkthrough init <dir> [--mode site|studio] [--url <baseUrl>] [--name <name>] [--force]

Scaffolds a project folder outside the kit:
  walkthrough.config.mjs   recorder config (site: baseUrl, dismiss, blockUrls; studio: + studio section)
  scenes.json              one URL-neutral declarative scene to edit (steps: recorder/takes/steps.mjs)
  studio.config.sh         studio mode only: a copy of studio/studio.config.example.sh to fill in
  brand.json, hyperframes.json, meta.json, package.json, CLAUDE.md, AGENTS.md, kit.json, compositions/,
  storyboard.example.json  the film project (node film/scripts/init-project.mjs <dir>)
  takes/                   where the takes go (git-ignored)
  .gitignore               the film's ignore list plus takes/, out/, voiceover/cache/ and cache-mock/, doctor.json, logins
  state.json               empty project state (schema walkthrough-state/1)

--mode     site (default): any URL, no studio; studio: an app you own, in a studio instance
--url      the base URL the takes open (site default https://example.com, studio http://localhost:4010)
--name     project name (default: the folder name)
--force    allow a folder that is not empty; existing files are kept, never overwritten`;

const siteConfig = ({ name, url }) => `// walkthrough.config.mjs: the recorder's view of this project (made by \`walkthrough init\`).
// Every key: <kit>/recorder/README.md, "The project interface". Relative paths resolve against this file.
export default {
  name: ${JSON.stringify(name)},
  baseUrl: ${JSON.stringify(url)}, // the site as the takes see it (--base-url, WALKTHROUGH_BASE_URL)
  viewport: "desktop", // "desktop" (1440x810 @2) | "phone" (390x844 @3)
  takesDir: "./takes",
  scenes: "./scenes.json", // declarative steps: <kit>/recorder/takes/steps.mjs
  storageState: null, // "./login.storage.json" from recorder/tools/save-login.mjs (a credential: keep it out of git)
  blockUrls: [], // requests to abort for the whole session, e.g. "**/analytics/**", "**/gtag/**"
  dismiss: [], // cookie / consent banners clicked off camera before each take, e.g. "#accept"
  safeArea: { top: 0, bottom: 120, on: ["click", "mark"] },
  session: { heartbeat: true },
  finish: { keepRaw: false, preset: "medium" },
  gate: { maxGapMs: 250 }, // as recorder/site-test; the recorder's default is 100 (see recorder/README.md, take runner)
  buffer: null, // CLI disk policy: a folder on a roomy volume for renders when this disk has < 5 GB free
};
`;

const studioConfig = ({ name, url }) => `// walkthrough.config.mjs: the recorder's view of this project (made by \`walkthrough init --mode studio\`).
// Every key: <kit>/recorder/README.md, "The project interface". Relative paths resolve against this file.
// The worked example of a studio project is <kit>/examples/brightpost/.
export default {
  name: ${JSON.stringify(name)},
  baseUrl: ${JSON.stringify(url)}, // the studio instance's web port (studio.config.sh)
  viewport: "desktop", // "desktop" (1440x810 @2) | "phone" (390x844 @3)
  takesDir: "./takes",
  adapter: null, // "./app.mjs": sign-in, sending a request, turn detection (recorder/README.md, Adapter module)
  scenes: "./scenes.json", // declarative steps, or "./scenes.mjs" for code scenes
  safeArea: { top: 0, bottom: 120, on: ["click", "mark"] },
  session: { heartbeat: true },
  finish: { keepRaw: false, preset: "medium" },
  gate: { maxGapMs: 100 },
  reload: { path: "/", settleMs: 2500 },
  studio: {
    bin: ${JSON.stringify(kitPath("studio/bin"))}, // the kit's studio scripts
    config: "./studio.config.sh", // fill it in: source repo, data dirs, services, ports, build
  },
  buffer: null, // CLI disk policy: a folder on a roomy volume for renders when this disk has < 5 GB free
};
`;

const SCENES = {
  _help: "Edit these steps for your app. Step types and targets: <kit>/recorder/takes/steps.mjs and recorder/README.md (Site mode). Inspect a page first: node <kit>/recorder/tools/inspect.mjs --config walkthrough.config.mjs --path /",
  scenes: [
    {
      name: "take-1-home",
      start: "/",
      steps: [
        { hold: 0.6 },
        { mark: "h1", label: "headline" },
        { hold: 1.2 },
        { scroll: { dy: 600 }, label: "to content" },
        { hold: 1.0 },
        { park: true, label: "end park" },
        { hold: 0.8 },
      ],
    },
  ],
};

const IGNORE_MARK = "# walkthrough CLI";
const IGNORE = `
${IGNORE_MARK}: takes, outputs and machine-local files
takes/
out/
voiceover/cache/
voiceover/cache-mock/
doctor.json
*.storage.json
storage.json
.env
.env.*
`;

export default {
  name: "init",
  describe: "scaffold a project folder: recorder config, scenes, film project, state.json",
  usage,
  async run(argv, ctx) {
    const { opts, positional } = parseArgs(argv, { boolean: ["force"], string: ["mode", "url", "name"] });
    const dir = positional[0];
    if (!dir) throw new CliError(`a folder is required\n\n${usage}`, 2);
    const mode = opts.mode ?? "site";
    if (!["site", "studio"].includes(mode)) throw new CliError(`--mode must be site or studio (got "${mode}")`, 2);
    const P = resolve(dir);
    if (insideKit(P)) throw new CliError(`${P} is inside the kit (${KIT_ROOT}); a project lives outside it (docs/adr/007-project-folders-outside-the-kit.md)`, 2);
    if (existsSync(P)) {
      const entries = readdirSync(P).filter((f) => f !== ".DS_Store");
      if (entries.length && !opts.force) throw new CliError(`${P} is not empty (${entries.length} entries); pass --force to add the missing files (nothing existing is overwritten)`, 2);
    }
    const name = opts.name ?? basename(P);
    const url = opts.url ?? (mode === "studio" ? "http://localhost:4010" : "https://example.com");
    mkdirSync(join(P, "takes"), { recursive: true });

    const wrote = [];
    const kept = [];
    const put = (file, content) => {
      const p = join(P, file);
      if (existsSync(p)) return kept.push(file);
      if (typeof content === "function") content(p);
      else writeFileSync(p, content);
      wrote.push(file);
    };
    put("walkthrough.config.mjs", (mode === "studio" ? studioConfig : siteConfig)({ name, url }));
    put("scenes.json", `${JSON.stringify(SCENES, null, 2)}\n`);
    if (mode === "studio") put("studio.config.sh", (p) => copyFileSync(kitPath("studio/studio.config.example.sh"), p));

    const r = await ctx.exec(process.execPath, [kitPath("film/scripts/init-project.mjs"), P], { inherit: false });
    if (r.code !== 0) throw new CliError(`film/scripts/init-project.mjs failed (${r.code}):\n${r.stderr || r.stdout}`);
    const filmWrote = (r.stdout.match(/: wrote (.*)$/m)?.[1] ?? "").split(", ").filter(Boolean);
    wrote.push(...filmWrote);

    const gi = join(P, ".gitignore");
    const giText = existsSync(gi) ? readFileSync(gi, "utf8") : "";
    if (!giText.includes(IGNORE_MARK)) {
      appendFileSync(gi, (giText && !giText.endsWith("\n") ? "\n" : "") + IGNORE);
      if (!wrote.includes(".gitignore")) wrote.push(".gitignore (appended)");
    }
    if (existsSync(join(P, "state.json"))) kept.push("state.json");
    else {
      writeState(P, emptyState({ name, mode }));
      wrote.push("state.json");
    }

    ctx.log.info(`project ${P} (${mode} mode)`);
    if (wrote.length) ctx.log.info(`  wrote: ${wrote.join(", ")}`);
    if (kept.length) ctx.log.info(`  kept:  ${kept.join(", ")}`);
    const cd = P === process.cwd() ? "" : `cd ${P} && `;
    const next =
      mode === "studio"
        ? [
            `${cd}walkthrough doctor                         # tools, disk, the project config`,
            `walkthrough studio tree --build && walkthrough studio up && walkthrough studio checkpoint CP0   # after filling in studio.config.sh`,
            `walkthrough take 1                                # edit scenes.json first; go files decide after each take`,
          ]
        : [
            `${cd}walkthrough doctor                         # tools, disk, the project config`,
            `walkthrough take --auto                           # edit scenes.json (and dismiss/blockUrls) first`,
            `walkthrough draft && walkthrough build --dry --audit`,
          ];
    ctx.log.info(`\nnext:\n  ${next.join("\n  ")}\n(walkthrough = node ${kitPath("bin/walkthrough.mjs")}; docs/CLI.md)`);
    return 0;
  },
};
