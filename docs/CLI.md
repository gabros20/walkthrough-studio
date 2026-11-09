# CLI reference: `walkthrough`

*Mode: reference. What every command does, its flags, what it writes, the state file, the disk policy
and the exit codes. Why there is one CLI: [DESIGN-batch-2.md](DESIGN-batch-2.md) §2.*

`bin/walkthrough.mjs` is one command over the kit's tools. It has no npm dependencies and needs Node 22+.
Each command prints the command it runs (one line starting with `›`) before running it, so you can paste
that line into a shell and get the same result. The CLI is a shortcut; the tools still work without it.

## Running it

```bash
node $KIT/bin/walkthrough.mjs <command> [args]          # from anywhere
npm run cli -- <command> [args]                         # inside the kit
npx --prefix $KIT walkthrough <command> [args]          # the package's bin, without installing it
```

To use it from a project folder, set `WALKTHROUGH_STUDIO_HOME` to the kit and add an alias:

```bash
export WALKTHROUGH_STUDIO_HOME=~/walkthrough-studio
alias walkthrough='node "$WALKTHROUGH_STUDIO_HOME/bin/walkthrough.mjs"'
```

`walkthrough help` (or no arguments) lists the commands. `walkthrough <command> --help` prints that
command's usage. `walkthrough help --all` prints every command's usage as Markdown. `walkthrough
--version` prints the kit version.

## The project

A project is one folder per film, outside the kit ([ADR-007](adr/007-project-folders-outside-the-kit.md)):

```
my-tour/
  walkthrough.config.mjs   recorder config (+ `buffer` for the disk policy)
  scenes.json              declarative steps (or scenes.mjs)
  studio.config.sh         studio mode only
  brand.json  storyboard.json  hyperframes.json  meta.json  package.json  kit.json  compositions/
  takes/<name>/            masters + events.json + take.json; takes/_runner/ status and go files
  renders/ out/ review/    outputs
  voiceover/ sound-build/  twins
  state.json               project state, written only by the CLI
  doctor.json              the last doctor report
```

The CLI finds the project in this order (first match wins):

1. `--project <dir>`. This is a global flag and can go anywhere on the line.
2. `WALKTHROUGH_PROJECT`.
3. The nearest folder at or above the current directory that holds `walkthrough.config.mjs` or `state.json`.

`init` and `doctor` run without a project. `help` shows which project was found. The other commands
stop with exit code 2 and a hint when there is no project.

## Commands

| Command | Runs | Writes |
|---|---|---|
| `init <dir> [--mode site\|studio] [--url <baseUrl>] [--name <n>] [--force]` | `node film/scripts/init-project.mjs <dir>` | the project scaffold (below), `state.json` |
| `doctor [--capture] [--out <file>] [--json]` | probes (`ffmpeg -encoders/-filters`, `python3 -I -c`, `npx hyperframes@0.9.16 --version`, …); `--capture`: `node recorder/capture-test.mjs new 2 idle 8` | `doctor.json`, `state.doctor` |
| `studio up\|down\|checkpoint <name>\|restore <name>\|status\|tree [--build]\|paths` | `STUDIO_CONFIG=<project studio config> bash studio/bin/<x>.sh …` | `state.checkpoints` (checkpoint), `state.currentCheckpoint` (restore) |
| `explore [url] [--depth 2] [--max-pages 20] [--storage f] [--viewport desktop\|phone] [--out d]` | `node recorder/tools/explore.mjs <url> --config <project config> --out <project> …` | `tour-map.json`, `tour-map.md`, `thumbs/`, `scenes.draft.json`; `state.tourMap` |
| `capture-test [mode scale phase seconds]` | `node recorder/capture-test.mjs …` (default `new 2 idle 30`) | `<takes>/_capture-test/…/result.json` (the tool's own) |
| `take [scene…] [--auto] [--fresh] [--from N] [--to N] [--parallel N] [runner flags]` | `node recorder/takes/run.mjs --config <project>/walkthrough.config.mjs …` | takes (the runner's), `state.takes`, `state.checkpoints` |
| `draft [take…] [--out <file>]` | `node film/scripts/draft-storyboard.mjs <take dirs…> --out <file>` | `storyboard.json`, or `storyboard.draft.json` when one exists |
| `build [storyboard] [--dry] [--audit] [--no-captions] [--placeholders] [--aspect a] [--fit-audio f] [--brand f] [--takes d] [build flags]` | (`node film/scripts/sync-assets.mjs` when needed) `node film/build.mjs <storyboard> --project <p> --takes <t> …` | the build's files, `state.builds`, `state.lastAudit` |
| `captions brief [storyboard] [--all] [--voice]`, `captions apply [answers] [storyboard] [--force]` | `node film/scripts/draft-captions.mjs brief\|apply … --takes <t> --project <p>` | `captions.brief.md` / `.json`, a blank `captions.answers.json`; apply: the storyboard (+ `.bak`); `state.captions` |
| `audit [storyboard] [--takes d] [audit flags]` | `node film/scripts/audit.mjs <storyboard> --project <p> --takes <t> …` | `state.lastAudit` |
| `render [--name final] [--fps 60] [--no-captions] [--no-build] [--placeholders] [--min-free GB] [--aspect a] [--fit-audio f] [--brand f] [--takes d] [render flags]` | disk policy, the build if needed (with the same build flags), `[caffeinate -i] npx --yes hyperframes@0.9.16 render -o renders/<name>.mp4 --fps <fps>` | `renders/<name>.mp4` + `.cues.json` `.edl.json` `.captions.srt`, `state.renders`, a `render` cost row |
| `review [--render final \| renders/x.mp4] [--out d] [bundle flags]` | `node film/scripts/review-bundle.mjs renders/<name>.mp4 --project <p> --out review/<name> --takes <t> --state state.json` | `review/<name>/` (`REVIEW.md`, `index.html`, `audit.json`/`.md`, `holds.md`, `audio.md`, `costs.md`, sheets, cut strips, `bundle.json`); `state.reviews` |
| `state [--json]`, `state lock`, `state unlock` | none (works on `state.json` directly) | `state.pictureLock` (lock/unlock) |
| `cost add --kind <tts\|music\|agent\|render\|other> --units <n> [--amount <n>] [--note <text>]`, `cost show [--json]` | none | `state.costs` |
| `vo tts\|assemble\|lexicon\|translate\|listen-check\|fitcheck\|place\|script …` | `node voiceover/tts.mjs`, `lexicon.mjs`, `translate-brief.mjs`, `listen-check.mjs`; `python3 -I voiceover/fitcheck.py`, `place.py`, `make_script.py` | the tools' files in `voiceover/`; `state.voiceover`; TTS cost rows from `voiceover/cost.jsonl` folded into `state.costs` (`ELEVENLABS_MOCK` rows are not) |
| `sound music\|build\|beat-grid …` | `node sound/generate-music.mjs`, `build-sound.mjs --project <p>` (disk policy with 1 GB, `caffeinate -i`), `beat-grid.mjs` | `sound-build/`, `music.json`; `state.sound`, `state.deliveries` (on a `delivered:` line), music cost rows |
| `deliver --preset sales\|web\|social\|docs …` | `python3 -I delivery/run_preset.py <preset> --project <p> …`, then `delivery/verify.py` | the package under `out/` with `MANIFEST.txt`; `state.deliveries` |

The full usage of every command is under [Usage of every command](#usage-of-every-command); it is
generated from the command files, so it is the authority when this table and it disagree.

### `init`

Makes `<dir>` and adds only the files that are missing. It never overwrites a file. It refuses a folder
that is not empty unless you pass `--force`, and it refuses a folder inside the kit.

- `walkthrough.config.mjs`:
  - **site** (the default): `baseUrl` (`--url`, default `https://example.com`), desktop viewport,
    `takesDir: "./takes"`, `scenes: "./scenes.json"`, empty `blockUrls`/`dismiss`, the safe area, and
    `gate.maxGapMs: 250` as in `recorder/site-test`. It also adds `buffer: null`.
  - **studio**: the same, plus `studio: { bin: <kit>/studio/bin, config: "./studio.config.sh" }`,
    `reload`, `gate.maxGapMs: 100`, and `baseUrl` `http://localhost:4010`.
- `scenes.json`: one scene with no URL-specific steps (`take-1-home`: a mark on `h1`, a scroll, a
  park). Edit it.
- `studio.config.sh` (studio mode only): a copy of `studio/studio.config.example.sh`.
- The film project, made by `film/scripts/init-project.mjs`: `hyperframes.json`, `meta.json`,
  `package.json`, `CLAUDE.md`, `AGENTS.md`, `.gitignore`, `kit.json`, `compositions/`, `brand.json`,
  `storyboard.example.json`.
- `takes/` and an appended `.gitignore` block: `takes/`, `out/`, `voiceover/cache/`,
  `voiceover/cache-mock/`, `doctor.json`, saved logins, `.env`.
- `state.json`, empty, with `mode` and `name`.

After that it prints the next three commands.

### `doctor`

It prints a table (`ok` / `info` / `warn` / `fail`) and exits 1 if any row is `fail`:

| Check | fail | warn |
|---|---|---|
| node | below 22 | |
| ffmpeg, ffprobe | missing; ffmpeg without `libx264` | ffmpeg without `drawtext` (contact sheets lose labels) |
| python3 | missing | `numpy` or `PIL` missing (prints the pip line) |
| `npx hyperframes@0.9.16 --version` | does not resolve | |
| Playwright Chromium | `recorder/node_modules/playwright-core` or its browser missing | |
| HyperFrames skills | | `/hyperframes`, `/media-use` or `/hyperframes-cli` not found in `~/.claude/skills` or a plugin. You run `npx hyperframes skills update` yourself |
| disk (project) | under 5 GB, unless the buffer has room | under 10 GB, or under 5 GB with a buffer that has room |
| disk (buffer) | | set but not mounted, or under 5 GB |
| `ELEVENLABS_API_KEY` | | (`info`: "set" or "not set", never the value) |
| caffeinate (macOS) | | missing |
| project config, scenes, storage state, studio config and scripts | missing or does not load | |
| base URL | | site mode: does not answer (`info` in studio mode, because `studio up` starts it) |
| capture test (`--capture`) | any pass flag false (unique frames, longest gap, sync, frame size) | |

The JSON report goes to `<project>/doctor.json`. With no project it goes to `./doctor.json`, except when
the current directory is the kit, which the CLI never writes to (pass `--out` there). With `--capture`,
the 8-second test writes into the project's takes folder, or into a temporary folder when there is no
project.

### `take`

Every argument is passed to the take runner unchanged ([recorder/README.md](../recorder/README.md), "The
take runner"). When the runner exits, the CLI reads what this run wrote and records each take in
`state.takes`. It reads `<runnerDir>/status-N.json` and `<take>/take.json`, newer than the run's
start:

- `ok`: the runner's verdict. No error, `masterSync.pass`, and the longest gap outside waits is at most
  `gate.maxGapMs`.
- `accepted`: equals `ok` under `--auto` or `--parallel`. With go files, it is true when the last
  `go-N` file of the run said `next` or `stop`, and null when the run ended without one.
- `checkpoint`: the go file's checkpoint, or, under `--auto` with a studio, the scene's
  `checkpoint` after a passing take. It is also appended to `state.checkpoints` with `by: "take"`.
- `duration`, `masterSync`, `gaps: { outsideWaitsMs, insideWaitsMs }`, `warnings` (a count),
  `uniqueFps`, `error` (the first line, when the take failed), and `dir`.

The exit code is the runner's.

### `draft`

With no take names, it drafts from the accepted takes in `state.json`. If there are none, it uses every
take folder with an `events.json` (not `_`-prefixed), in natural name order. It writes `storyboard.json`
when the project has none. Otherwise it writes `storyboard.draft.json`, so a storyboard you have
refined is only replaced when you pass `--out storyboard.json`.

### `build` and `audit`

The takes folder comes from `--takes`, else the config's `takesDir` (resolved by `recorder/config.mjs`),
else `<project>/takes`. `--aspect`, `--fit-audio`, `--fit-gap` and `--fit-max` go to the film build
(relative paths are taken from the current directory, like `--brand` and `--takes`). Flags the CLI does
not know are passed through (`--no-cut`, `--dry-out <dir>`, `--hold`, `--jump`, `--json`, …). Each
`build` is appended to `state.builds` with its resolved inputs (aspect, brand file and sha256, takes
folder, fit-audio placement and sha256), which `render` compares before deciding to rebuild. The audit counts come from
the audit's last line (`audit: N error(s), M warning(s)`). When a picture lock is set and the
storyboard's sha256 differs from it, `build` warns.

Before a real (not `--dry`) build, the title and end cards need `assets/creatives/manifest.json`, and a
brand logo needs `assets/brand/manifest.json`. When either is missing and there is something to sync
(`creatives.json`, or a logo in `brand.json`), `build` runs `node film/scripts/sync-assets.mjs` first. If
there are still no creatives, it stops with a hint. `--placeholders` writes flat stand-ins instead
(`film/scripts/make-placeholder.mjs 1 --creatives`), which is enough for a first draft.

### `render`

1. **Disk policy** (below), before anything else.
2. **Build if needed.** It builds first when `index.html` or `cues.json` is missing, when `cues.json`'s
   `captions` flag differs from this render (`--no-captions` asks for the captionless twin), when the
   storyboard changed since the last recorded build, or when an input differs from the build on disk:
   the aspect (`--aspect`, `FILM_ASPECT`, the storyboard's `look.aspect`, the brand's, else 16:9; the
   built aspect is read from `index.html`'s canvas), the fit-audio placement (`--fit-audio` or the
   storyboard's `fitAudio`: on or off, the file and its sha256, gap, max), the brand file (path and
   sha256) or the takes folder. It prints every input that changed. The build flags `--aspect`,
   `--fit-audio`, `--fit-gap`, `--fit-max`, `--brand`, `--takes`, `--no-captions` and `--placeholders`
   go to that build exactly as `walkthrough build` passes them, so give `render` the flags you built
   with (or keep them in the storyboard). With `--no-build` it renders what is on disk and warns about
   each input that differs.
3. `npx --yes hyperframes@0.9.16 render -o renders/<name>.mp4 --fps <fps>` in the project, under
   `caffeinate -i` on macOS. Unknown flags are passed to it (`--quality`, `--workers`, …).
4. Copies `cues.json`, `edl.json` and `captions.srt` to `renders/<name>.cues.json`, `.edl.json` and
   `.captions.srt` (the sound build reads them). It reads the duration and fps with ffprobe and warns
   when the duration is more than a frame away from `cues.json`. It appends to `state.renders` and adds
   a cost row of kind `render` (wall-clock minutes).

## Usage of every command

Each command's `usage` export, exactly as `walkthrough <command> --help` prints it. `walkthrough help
--all` prints this whole section. `node scripts/cli-docs.mjs` rewrites it after a command file changes,
and `node scripts/cli-docs.mjs --check` fails when it is out of date.

<!-- walkthrough help --all: begin (generated by scripts/cli-docs.mjs; do not edit by hand) -->

### `walkthrough audit`

audit the last build: holds, pointer jumps, dead air, captions, claims

```text
walkthrough audit [storyboard.json] [--takes <dir>] [audit flags]

Runs node <kit>/film/scripts/audit.mjs <storyboard> --project <project> --takes <takes> [flags] in the
project, on the files the last build wrote (edl.json, cues.json, captions.srt). Flags pass through:
--hold s, --jump px, --tail s, --no-holds, --json, --edl/--cues/--srt <file> (film/README.md, Scripts).
The counts go to state.lastAudit. Exit 1 on errors (the audit's own exit code).
```

### `walkthrough build`

build the film compositions (film/build.mjs); records the build in state.json

```text
walkthrough build [storyboard.json] [--dry] [--audit] [--no-captions] [--aspect 16:9|9:16|1:1]
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
parsed from the audit's last line; render compares the inputs with the last full build's). Exit code: the build's.
```

### `walkthrough captions`

caption brief for the agent, then apply its answers to the storyboard (draft-captions.mjs)

```text
walkthrough captions brief [storyboard.json] [--all] [--voice] [--takes <dir>] [--out f] [--json f]
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
Records state.captions { briefAt, appliedAt, count, applied }. Then: walkthrough build --dry --audit.
```

### `walkthrough capture-test`

the recorder's capture-quality test (default: new 2 idle 30)

```text
walkthrough capture-test [mode] [scale] [phase] [seconds]

Runs node <kit>/recorder/capture-test.mjs <mode> <scale> <phase> [seconds] (default: new 2 idle 30) and
prints the verdict. Results go to <takes>/_capture-test/<mode>-<scale>x-<phase>/result.json, with
<takes> = the project's takes folder (WALKTHROUGH_TAKES), else the recorder's default.
  mode   new | shell | headed        scale  2 | 1.5        phase  idle | load | drift
Exit 1 when any pass flag (unique fps, longest gap, sync, frame size) is false. The pass table is in
docs/CAPTURE_TEST.md. Record on a quiet machine: no renders or encodes while it runs.
```

### `walkthrough cost`

cost ledger: add a row (tts, music, agent, render, other) or show it

```text
walkthrough cost add --kind <tts|music|agent|render|other> --units <n> [--amount <n>] [--note <text>]
walkthrough cost show [--json]

The ledger in state.json costs[]: { at, kind, units, amount, note }. Units are what the provider
counts (TTS characters, music seconds, agent turns or tokens, render minutes); amount is money in
whatever currency you keep the ledger in (optional). The sound and voiceover tools and
`walkthrough render` add rows themselves; `walkthrough review` copies the ledger into REVIEW.md.
  show     every row, then totals per kind
```

### `walkthrough deliver`

delivery presets: sales package, web embed, social cuts, docs clips and GIFs

```text
walkthrough deliver --preset sales|web|social|docs [--render final] [--vo-render final-vo|none]
                    [--video <file>] [--vo-video <file>] [--out out/<name>] [--config package.config.json]
                    [--product <name>] [--zip] [--burn | --no-burn] [--allow-silent] [--min-free <GB>]

Runs python3 -I <kit>/delivery/run_preset.py <preset> --project <project> [flags] in the project. It reads
renders/<render>.mp4 with its sidecars (.edl.json, .captions.srt, .cues.json) and the storyboard's scene groups,
prints every python/ffmpeg command it runs ("›"), writes MANIFEST.txt and runs delivery/verify.py.
  sales    the full package from package.config.json (generated from the renders when there is none), zipped
  web      1080p30 + 720p encodes, poster, .srt + .vtt, description.txt with YouTube chapters
  social   one clip per scene group, at most 60 s, captions burned in (renders/<render>-9x16.mp4 when it exists)
  docs     one clip per scene group (10-30 s) with its .srt, a GIF of at most 8 MB, a poster .jpg, and index.md
  --render       render name (default final); --vo-render: the voiceover twin (default final-vo when it exists)
  --video        the mixed film to use instead of renders/<render>.mp4 (the sound build's --deliver output)
  --out          output folder (default out/<Product>_<Preset>; sales: the config's "out")
  --zip          zip the result with delivery/zip.sh (sales always zips)
  --burn         burn captions even when the picture already carries them; --no-burn never burns
  --allow-silent accept a render without audio (test renders only; sales refuses silent masters)
  --min-free     free space needed, in GB (default: sales 6x, web 2x, social 2x, docs 3x the films' size; at least 1 GB)
Disk policy: when the project volume is short and a buffer has room, the output is written on the buffer and
the zip is copied back to <project>/out/ (--zip is implied). Each run is appended to state.deliveries:
{ at, preset, render, out, zip, files, bytes, spilled, exit }.
Presets and their numbers: delivery/presets.json; outputs: docs/DELIVERY.md.
```

### `walkthrough doctor`

check tools, disk, keys and the project config; --capture runs the 8 s capture test

```text
walkthrough doctor [--capture] [--out <file>] [--json]

Checks this machine and the project, prints a table (ok / info / warn / fail) and exits 1 on any fail:
  node >= 22; ffmpeg + ffprobe (ffmpeg with libx264; drawtext, else warn: contact sheets lose labels);
  python3 with numpy and PIL; npx hyperframes@0.9.16 --version; Playwright Chromium for recorder/;
  the HyperFrames skills (hyperframes, media-use, hyperframes-cli) in ~/.claude; free disk on the project volume and the
  buffer (warn < 10 GB, fail < 5 GB unless the buffer has room); ELEVENLABS_API_KEY set or not (the
  value is never printed); caffeinate on macOS; the project config, scenes, studio config and base URL.
--capture  also runs the 8 s capture test (recorder/capture-test.mjs new 2 idle 8) and reports the
           delivered fps, unique frames per second, the longest gap and the sync drift
--out      where to write the JSON report (default <project>/doctor.json, else ./doctor.json; never in the kit)
--json     print the JSON report instead of the table
```

### `walkthrough draft`

first-pass storyboard from the takes (film/scripts/draft-storyboard.mjs)

```text
walkthrough draft [take ...] [--out <file>]

Runs node <kit>/film/scripts/draft-storyboard.mjs <take dirs ...> --out <file> in the project.
  take    take folder names (in <takes>) or paths; default: the accepted takes in state.json, else
          every take folder with an events.json (not _-prefixed), in natural name order
  --out   default storyboard.json when the project has none, else storyboard.draft.json, so a
          refined storyboard is never overwritten unless you name it
One scene per take, agent waits as time-lapses, a framing and a TODO caption per click (film/README.md).
```

### `walkthrough explore`

tour map of a site: pages, controls, thumbnails and drafted scenes

```text
walkthrough explore [url] [--depth 2] [--max-pages 20] [--storage <state.json>] [--viewport desktop|phone]
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
Inside a project the run is recorded in state.json as tourMap: { at, startUrl, pages, controls, skipped, file }.
```

### `walkthrough init`

scaffold a project folder: recorder config, scenes, film project, state.json

```text
walkthrough init <dir> [--mode site|studio] [--url <baseUrl>] [--name <name>] [--force]

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
--force    allow a folder that is not empty; existing files are kept, never overwritten
```

### `walkthrough render`

render the film (HyperFrames) with the disk policy; copies the sidecars, records the render

```text
walkthrough render [--name final] [--fps 60] [--no-captions] [--no-build] [--placeholders] [--min-free <GB>]
                  [--aspect 16:9|9:16|1:1] [--fit-audio <placement.json> [--fit-gap <s>] [--fit-max <s>]]
                  [--brand <file>] [--takes <dir>] [render flags]

1. Disk policy (docs/CLI.md), before anything else: >= 5 GB (--min-free) free on the project volume
   renders locally; else, with a buffer configured and mounted with room, renders into
   <buffer>/<project>/render/ (TMPDIR and the HyperFrames frame cache there too) and copies the file
   back; else stops. On macOS the render runs under caffeinate -i.
2. Build first when the build on disk is not what this render asks for (unless --no-build): when
   index.html or cues.json is missing; when cues.json's captions flag differs from this render
   (--no-captions wants the voiceover twin); when the storyboard changed since the last recorded
   build; or when an input differs from the build's: the aspect (--aspect, FILM_ASPECT, the
   storyboard's look.aspect, the brand's, else 16:9; the built one is read from index.html), the
   fit-audio placement (--fit-audio or the storyboard's fitAudio: on/off, file, sha256, gap, max),
   the brand file (path and sha256) or the takes folder. It prints each input that changed. The
   build flags (--aspect, --fit-audio, --fit-gap, --fit-max, --brand, --takes, --no-captions,
   --placeholders) go to that build, as in `walkthrough build`; give render the flags you built
   with (or keep them in the storyboard), else it rebuilds to match what the inputs say now.
   With --no-build it renders what is there and warns about each input that differs.
3. npx --yes hyperframes@0.9.16 render -o renders/<name>.mp4 --fps <fps>   (in the project; other flags pass through)
4. Copies cues.json, edl.json, captions.srt to renders/<name>.cues.json / .edl.json / .captions.srt
   (the sound build and the voiceover tools read those), reads duration and fps with ffprobe, and
   appends { name, file, at, fps, duration, captions, storyboardHash, seconds, spill } to state.renders
   plus a cost row (kind render, units = wall-clock minutes).
Exit code: the render's (or the build's, when the build fails).
```

### `walkthrough review`

review bundle for a render: sheets, cut strips, audit, holds, audio, costs, REVIEW.md, review page

```text
walkthrough review [--render final | <renders/name.mp4>] [--out <dir>] [--takes <dir>] [bundle flags]

Runs node <kit>/film/scripts/review-bundle.mjs <project>/renders/<name>.mp4 --project <project>
--out <project>/review/<name> --takes <takes> --state <project>/state.json in the project, which writes
into the out folder: REVIEW.md, index.html (the static review page: open it in a browser, no server),
audit.md/.json, holds.md, audio.md, costs.md, sheets/<scene>.jpg, cuts/<nn>-<t>.jpg, bundle.json
(docs/REVIEW.md). The render's sidecars (renders/<name>.cues.json, .edl.json, .captions.srt) must
be beside it; `walkthrough render` copies them.
  --render <name>    the render to review (default: the last one in state.renders, else "final");
                     a path to an .mp4 works too
  --out <dir>        the bundle folder (default <project>/review/<name>)
Other flags pass through: --storyboard <f>, --sound-build <dir>, --placement <f>, --fps-sheet <n>,
--width <px>, --hold <s>, --labels auto|drawtext|pillow|none.
Appends { render, out, at, audit: { errors, warnings }, holds, labels } to state.reviews.
Exit code: the bundle's (0 when it is written, whatever the findings).
```

### `walkthrough sound`

sound: generate a music take (API key), build the soundtrack and deliver, measure the beat grid

```text
walkthrough sound <step> [args]   (sound/README.md, docs/ELEVENLABS.md)

  music --prompt-file music.prompt.txt [--seconds N] [--out music-take1.mp3] [--model music_v2_5] [--instrumental]
        node sound/generate-music.mjs: one take from the ElevenLabs music API (ELEVENLABS_API_KEY);
        --seconds defaults to the last render's length + 2 s. Never overwrites a take (it cost credits).
        Without a key it prints the connector steps (exit 2).
  build [--video renders/<name>.mp4] [--voiceover voiceover/vo-track.wav] [--deliver out/<film>.mp4] [build-sound flags]
        node sound/build-sound.mjs --project <project> …: the bed, effects, (voiceover mix), mux and checks.
        --video defaults to the last recorded render (state.renders). Disk policy first (1 GB, or
        --min-free <GB>): on a short disk the work files go to the buffer (--work). macOS: caffeinate -i.
  beat-grid [music.mp3] [--bpm 96] [--groove 10,110] [--dry]
        node sound/beat-grid.mjs: tempo and beat phase into music.json (the file defaults to music.json's "file")

Other flags pass through unchanged. Exit code: the tool's.
```

### `walkthrough state`

print the project state (takes, builds, renders, costs); lock/unlock the picture

```text
walkthrough state [--json]
walkthrough state lock | unlock

Prints the project state (schema walkthrough-state/1; docs/CLI.md has the full shape): takes, checkpoints,
picture lock, tour map, captions, builds, renders, reviews, sound, voiceover, deliveries, disk spills
and the cost ledger.
  --json   the raw state.json
  lock     picture lock: records the storyboard's sha256 (later builds warn when it changes)
  unlock   clears the picture lock
```

### `walkthrough studio`

studio instance: up, down, checkpoint <name>, restore <name>, status, tree, paths

```text
walkthrough studio <up|down|checkpoint <name>|restore <name>|status|tree [--build]|paths>

Runs the kit's studio scripts with the project's studio config:
  STUDIO_CONFIG=<project studio config> bash <kit>/studio/bin/<script>.sh [args]
  up / down             start / stop the studio services (safe to repeat)
  checkpoint <name>     clone every data dir into checkpoints/<name>   (recorded in state.checkpoints)
  restore <name>        replace the data with the checkpoint, bring the stack up (state.currentCheckpoint)
  status                pids, ports, health, checkpoints on disk
  tree [--build]        fresh copy of the source repo (+ production build)
  paths                 resolved paths as KEY=value lines
The studio config is walkthrough.config.mjs studio.config (made by `walkthrough init --mode studio`).
Site-mode projects have none; the studio is for an app you own and run locally (studio/README.md).
```

### `walkthrough take`

record takes with the take runner and record them in state.json

```text
walkthrough take [scene ...] [--auto] [--fresh] [--from N] [--to N] [--parallel N] [runner flags]

Runs node <kit>/recorder/takes/run.mjs --config <project>/walkthrough.config.mjs [args], with every
argument passed through (scenes by number or name; --base-url, --storage, --mode, --viewport,
--studio-config, --popups, --dialogs too). See recorder/README.md, "The take runner".
  --auto          no go files: continue while takes pass, stop on the first failure
  --parallel N    site mode only: N independent takes at a time (implies --auto; refused with a studio)
  (no --auto)     after each take the runner waits for <takes>/_runner/go-N.json (next | redo | stop)

When the runner exits, every take it wrote in this run is recorded in state.takes:
  { recordedAt, ok, accepted, checkpoint, duration, masterSync, gaps: { outsideWaitsMs, insideWaitsMs },
    warnings, uniqueFps, dir }
ok = the runner's verdict (no error, master sync passed, longest gap outside waits <= gate.maxGapMs).
accepted = ok under --auto/--parallel; with go files, true when the last go file for that take was
"next" or "stop", null when the run ended without one. Exit code: the runner's.
```

### `walkthrough vo`

voiceover: per-line TTS, assemble, lexicon, translations, listening proxy, fit check, place

```text
walkthrough vo <step> [args]   (the voiceover tools; docs/VOICE.md, voiceover/README.md)

  tts --voice <id> [--script voiceover/script.json] [--model eleven_v4] [--lang de] [--lexicon f] [--no-assemble]
        node voiceover/tts.mjs render: one TTS request per line, cached by text; then assemble.
        Without ELEVENLABS_API_KEY it lists the lines to generate with the connector (exit 2).
  assemble [--script …] [--windows windows.json] [--cues cues.json] [--film <s>] [--lang de] [--dry]
        node voiceover/tts.mjs assemble: the line files -> vo-track.wav, placement.json, voiceover.srt
  lexicon check|show [script.json] [--lexicon f]
        node voiceover/lexicon.mjs: words TTS may get wrong / what the lexicon changes
  translate brief|apply <lang> [--script …] [--captions captions.srt] [--windows …] [--ui-translated]
        node voiceover/translate-brief.mjs: translation briefs, then script.<lang>.json + captions.<lang>.srt
  listen-check <mix.mp4|vo-track.wav> [--vo voiceover/vo-track.wav] [--bed sound-build/bed.wav] [--script …]
        node voiceover/listen-check.mjs: transcript vs script, voice over music, clipping (measured, not heard)
  fitcheck --old-edl … --old-cues … --new-edl … --new-cues … [--out windows.json] [L21=s,e …]
        python3 -I voiceover/fitcheck.py --vo-dir voiceover …: re-timed picture vs placed lines
  place <take.mp3> <words.json> (--edl … --cues … | --windows …) [--name film] [--dry]
        python3 -I voiceover/place.py … --vo-dir voiceover: cut a one-take narration into placed lines
  script <lines.json> [--edl edl.json --cues cues.json]
        python3 -I voiceover/make_script.py … --out voiceover: script.json + script.txt, fit checked

The script defaults to voiceover/script.json and the voiceover folder to voiceover/ in the project.
Other flags pass through unchanged. Exit code: the tool's.
```

<!-- walkthrough help --all: end -->

## State file: `state.json`

Schema `walkthrough-state/1`. Only the CLI writes it. It is written atomically (a temporary file, then a
rename), and created by `init` or by a command's first save. Keys a command does not know are kept, so
a new command can add its own section.

```json
{
  "schema": "walkthrough-state/1",
  "name": "my-tour",
  "mode": "site",
  "createdAt": "…", "updatedAt": "…",
  "takes": {
    "take-1-search": {
      "recordedAt": "…", "ok": true, "accepted": true, "checkpoint": null, "duration": 14.2,
      "masterSync": true, "gaps": { "outsideWaitsMs": 83.3, "insideWaitsMs": 0 }, "warnings": 0,
      "uniqueFps": { "other": { "seconds": 12, "median": 60, "p10": 58, "min": 56 } }, "dir": "takes/take-1-search"
    }
  },
  "checkpoints": [ { "name": "CP1", "at": "…", "by": "studio | take", "after": "take-1-…" } ],
  "currentCheckpoint": { "name": "CP1", "at": "…" },
  "pictureLock": { "hash": "<sha256 of storyboard.json>", "at": "…" },
  "builds": [ { "at": "…", "dry": false, "storyboardHash": "…", "captions": true, "audit": { "errors": 0, "warnings": 2 }, "exit": 0 } ],
  "lastAudit": { "at": "…", "errors": 0, "warnings": 2, "exit": 0 },
  "renders": [ { "name": "final", "file": "renders/final.mp4", "at": "…", "fps": 60, "duration": 15.98, "bytes": 8123456,
                 "captions": true, "storyboardHash": "…", "seconds": 141.2, "caffeinated": true, "spill": null } ],
  "tourMap": { "at": "…", "startUrl": "https://example.com", "pages": 12, "controls": 240, "skipped": 3, "file": "tour-map.json" },
  "captions": { "briefAt": "…", "appliedAt": "…", "count": 9, "applied": 9 },
  "reviews": [ { "render": "renders/final.mp4", "out": "review/final", "at": "…", "audit": { "errors": 0, "warnings": 2 }, "holds": 1, "labels": "drawtext" } ],
  "sound": [], "voiceover": [], "deliveries": [],
  "spills": [ { "at": "…", "step": "render", "from": "<project>", "to": "<buffer>/<project>/render", "projectFree": 0, "bufferFree": 0 } ],
  "costs": [ { "at": "…", "kind": "tts", "units": 1377, "amount": null, "note": "27 lines" } ],
  "doctor": { "at": "…", "fails": 0, "warns": 2 }
}
```

`tourMap` is written by `explore`, `captions` by `captions brief` / `apply`, `reviews` by `review`;
`sound`, `voiceover` and `deliveries` are filled by the `sound`, `vo` and `deliver` commands (see their
`--help`). Command files change state through `ctx.project.state` and `ctx.project.save()`. The helpers
are in `cli/lib/state.mjs`.

## Disk policy

`render` calls `cli/lib/disk.mjs`, and so do `sound` and `deliver`. Free space comes from `df -k -P`.

| Project volume | Buffer | What happens |
|---|---|---|
| ≥ 5 GB free (`render --min-free <GB>` changes the 5) | any | works locally |
| < 5 GB | `buffer` set in `walkthrough.config.mjs` (or `WALKTHROUGH_BUFFER`), mounted, ≥ 5 GB free | **spill**: the render's output, `TMPDIR` and the HyperFrames frame-extract cache (`HYPERFRAMES_EXTRACT_CACHE_DIR`) go to `<buffer>/<project name>/<step>/`, and the final file is copied back to `renders/` |
| < 5 GB | none, not mounted, or too small | stops before the step and says how much is needed |

A buffer counts as mounted when the folder or its parent exists. An unmounted `/Volumes/X/…` does not
count. Each spill is printed and recorded in `state.spills`. On macOS, long steps run under
`caffeinate -i` (turn it off with `WALKTHROUGH_NO_CAFFEINATE=1`). The design named a
`--frames-cache-dir` flag. HyperFrames 0.9.16 has no such flag, so the cache is moved with
`HYPERFRAMES_EXTRACT_CACHE_DIR` and `TMPDIR` instead.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | done |
| 1 | a step failed: a doctor `fail`, audit errors, a capture test that did not pass, the disk policy stopped, or an error thrown in a command |
| 2 | usage: unknown command, a missing or invalid argument, no project found, a project in the kit |
| other | passed through from the wrapped tool (`take`, `build`, `render`, `studio`, …); 130 after Ctrl-C |

## Writing a command

Add `cli/commands/<name>.mjs`:

```js
import { requireProject, kitPath } from "../lib/project.mjs";
export default {
  name: "hello",
  describe: "one line for `walkthrough help`",
  usage: "walkthrough hello [--flag]\n\nWhat it runs and writes.",
  async run(argv, ctx) {
    const project = requireProject(ctx);              // or ctx.project (null outside a project)
    const r = await ctx.exec(process.execPath, [kitPath("film/scripts/x.mjs")], { cwd: project.dir }); // prints "› …"
    project.state.hello ??= [];
    project.state.hello.push({ at: new Date().toISOString(), exit: r.code });
    project.save();
    return r.code;                                     // the exit code
  },
};
```

The loader reads the folder at start and sorts the commands by name. If a file fails to import, the
loader prints one warning line and skips it. Shared helpers:

- `cli/lib/args.mjs`: `parseArgs`. Unknown flags are kept for passing through.
- `cli/lib/project.mjs`: `KIT_ROOT`, `kitPath`, `requireProject`, `resolvedConfig`, `takesDirOf`, `CliError`.
- `cli/lib/state.mjs`: `addCost`, `sha256File`, `rel`, `now`.
- `cli/lib/disk.mjs`: `diskPolicy`, `withCaffeinate`, `spillEnv`, `freeBytes`.
- `cli/lib/exec.mjs`: `exec`, `announce`, `capture`, `which`.
- `cli/lib/table.mjs`: `table`, `printTable`, `fmtBytes`, `fmtSeconds`.
- `cli/lib/film.mjs`: `runBuild`, `storyboardOf`, `parseAuditLine`.

Throw `CliError(message, code)` for expected failures. It prints the message without a stack.
