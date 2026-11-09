# Changelog

All notable changes to this kit. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/) and are set with `scripts/version.mjs` (see `docs/MAINTAINERS.md`).

## [Unreleased]

## [0.2.0] - 2026-11-09

### Added

- **One CLI** (`bin/walkthrough.mjs`, `cli/`; [`docs/CLI.md`](CLI.md)): `walkthrough init | doctor | studio | explore |
  capture-test | take | draft | captions | build | audit | render | review | sound | vo | deliver | state | cost`,
  zero dependencies, Node 22+, one file per command in `cli/commands/`; every command prints the command it runs
  (`›`), and projects are found by `--project`, `WALKTHROUGH_PROJECT` or the nearest folder with
  `walkthrough.config.mjs` / `state.json`.
- **`walkthrough doctor [--capture]`**: Node, ffmpeg (libx264, drawtext), Python with numpy and Pillow,
  HyperFrames, Playwright Chromium, the HyperFrames skills, free disk on the project and the buffer, keys by name
  only, the project config and base URL; writes `doctor.json`, exits 1 on a fail.
- **Project state** (`state.json`, schema `walkthrough-state/1`, written only by the CLI): takes with verdict,
  sync and gaps, checkpoints, picture lock (`state lock`), tour map, captions, builds with audit counts, renders,
  reviews, sound, voice, deliveries, disk spills and a cost ledger (`cost add|show`; render minutes, TTS
  characters and music seconds are added by the tools).
- **Disk policy** (`cli/lib/disk.mjs`): `render`, `sound` and `deliver` stop before they start when neither the
  project volume nor the configured `buffer` has room, spill scratch and output to the buffer when only it has
  room, and run under `caffeinate -i` on macOS.
- **Tour map** (`recorder/tools/explore.mjs`, `walkthrough explore`): a read-only breadth-first crawl of
  same-site links (robots.txt honoured, nothing clicked or submitted) that writes `tour-map.json` (schema
  `walkthrough-tour-map/1`), `tour-map.md` (landmarks, headings, up to 80 controls per page), 480 px thumbnails
  and `scenes.draft.json`, with destructive, consent and submit controls listed under `_skipped`.
- **New tabs, downloads and dialogs in takes** (contract additive, still `walkthrough-take/1`): `popups:
  "same-tab" | "follow" | "block"`, downloads saved to `<take>/downloads/` and logged as `download` events,
  `dialogs: "accept" | "dismiss"` logged as `dialog` events; `npm run site-test` records a second take that
  covers all three.
- **Parallel takes** (`walkthrough take --parallel N`, site mode only): independent scenes recorded N at a time,
  each in its own browser and take folder, with master encodes held until no take is capturing; refused when the
  config has a studio.
- **Pointer bridging at cuts** (`film/lib/pointer.mjs`, `film/build.mjs`): a cut that moves the drawn pointer
  more than 120 stage px gets a 0.35 s arc bridge (up to 400 px) or a fade; storyboard `pointerAtCuts`, `jump`
  and per-cut `pointer`; each treatment is printed, listed in `edl.json` `pointerTreatments` and in the audit.
- **Aspect presets and the phone bezel** (`look.aspect: "16:9" | "9:16" | "1:1"`, `--aspect`, `FILM_ASPECT`;
  [`docs/LOOK.md`](LOOK.md) "Aspect presets"): window, band, captions (two lines at 9:16 and 1:1), tag, camera,
  pointer, wipe and stacked title and end cards derived from the aspect and the take; 9:16 needs a phone take
  unless `look.allowLetterbox`; a phone take gets a neutral device bezel (`look.bezel: false` turns it off);
  16:9 over a desktop take is byte-identical to 0.1.0.
- **Caption drafting** (`film/scripts/draft-captions.mjs`, `walkthrough captions brief|apply`;
  [`docs/CAPTIONS.md`](CAPTIONS.md)): the tool briefs every `TODO:` caption (scene `intent`, anchor, marks and
  their text, window, word budget, claim candidate; `--voice` adds voice windows), an agent fills
  `captions.answers.json`, and `apply` checks quoted UI text against the marks, sets `claims`, refuses
  over-long answers, raises short holds and runs the caption lint.
- **Script-first timing** (`film/build.mjs --fit-audio voiceover/placement.json`, or `"fitAudio"` in the
  storyboard): every voice line longer than its window gets a frame-exact hold on the longest rest moment in
  it, shown in the durations table, `edl.json` `fitAudio` and the audit's `fit` row; the build refuses with
  the line, window and shortfall when a line cannot fit; without the flag the output is byte-identical.
- **Review bundle and page** (`film/scripts/review-bundle.mjs`, `walkthrough review`;
  [`docs/REVIEW.md`](REVIEW.md)): `review/<name>/` per render with contact sheets, cut strips, the audit on
  the render's own sidecars, holds, audio (measured, not heard), costs, `REVIEW.md` with the critic checklist,
  and a static `index.html` where findings seek the video and notes export as `review-notes.json`.
- **Golden test** (`npm test`, CI job `test`): `test/run.mjs` builds a two-scene fixture (`--dry --dry-out`
  and the new `build.mjs --emit-only`) and compares `edl.json`, `cues.json`, `captions.srt` and composition
  hashes with `test/golden/`; `npm run test:update` rewrites them with a diff, `npm run test:render` compares
  eight rendered frames.
- **Per-line voiceover with a cache** (`voiceover/tts.mjs`, `walkthrough vo tts|assemble`;
  [`docs/VOICE.md`](VOICE.md)): one ElevenLabs request per line, cached by voice, model, lexicon version and
  text, assembled onto the windows (or back to back for a voice-first script) into `vo-track.wav`,
  `placement.json` (carrying each script line's `anchor` for `--fit-audio`) and `voiceover.srt`; without a key
  it lists the lines for the connector and assembles the files dropped in.
- **Pronunciation lexicon** (`voiceover/lexicon.json`, `voiceover/lexicon.mjs check|show`): spelling hints
  applied to the text sent to TTS only, and a list of words likely to be mispronounced.
- **Language twins** (`voiceover/translate-brief.mjs brief|apply <lang>`, `walkthrough vo translate`): per-line
  and per-caption briefs with the fit limits and the claims to keep, checked into `script.<lang>.json` and
  `captions.<lang>.srt`; `tts.mjs --lang` renders the twin.
- **Listening proxy** (`voiceover/listen-check.mjs`, `walkthrough vo listen-check`): per-line word error rate,
  missing and extra words, voice over music and clipping runs from the mix, reported as measured, not heard.
- **Music by API key** (`sound/generate-music.mjs`, `walkthrough sound music`): one `POST /v1/music` take that
  never overwrites an earlier take, with a cost row, and the connector steps without a key;
  `ELEVENLABS_MOCK=1` tests both API scripts without credits.
- **Beat grid into music.json** (`sound/beat-grid.mjs`, `walkthrough sound beat-grid`): tempo and beat phase
  measured with `sound/analysis/` and written with the evidence; `walkthrough sound build` runs
  `build-sound.mjs` on the last render under the disk policy.
- **Delivery presets** (`delivery/presets.json`, `delivery/run_preset.py`, `walkthrough deliver --preset
  sales|web|social|docs`; [`docs/DELIVERY.md`](DELIVERY.md)): `sales` (the full package, config generated when
  missing), `web` (1080p30 and 720p, poster, `.srt` + `.vtt`, YouTube chapters), `social` (clips of at most
  60 s with captions burned in, vertical from a 9:16 render), `docs` (10-30 s clips, `.srt`, GIFs of at most
  8 MB, `index.md`); every preset writes `MANIFEST.txt` and runs `verify.py`, which now checks any folder with
  `--dir`.
- `npm run check` fails when `docs/CLI.md` drifts from `walkthrough help --all` (`scripts/cli-docs.mjs
  [--check]` rewrites or checks it).
- Docs: [`docs/CLI.md`](CLI.md), [`docs/CAPTIONS.md`](CAPTIONS.md), [`docs/REVIEW.md`](REVIEW.md),
  [`docs/VOICE.md`](VOICE.md) and the design note [`docs/DESIGN-batch-2.md`](DESIGN-batch-2.md).
- **Model tiers on other agents** ([`docs/MODELS.md`](MODELS.md)): the large, medium and small model on Claude
  Code, Codex, Antigravity, Cursor and Hermes, the config keys that set them per sub-agent, sourced and dated.

### Changed

- The skills, agents, README and website lead with the CLI flow (`init`, `doctor`, `explore`, `take`, `draft`,
  `captions`, `build`, `render`, `review`, `sound`, `vo`, `deliver`); the direct tool commands stay as the
  fallback.
- `film/build.mjs` with no storyboard argument reads the project's `storyboard.json` for its config (`look`,
  `fps`, `brand`, `takesDir`); `edl.json` marks montage slices with `"montage": true`.
- `delivery/films.py` web encodes keep the film's shape (a 9:16 film encodes to 1080x1920); `films.py` and
  `clips.py` expose their encodes for the presets.
- The roadmap says what is folded in and what comes next.

### Fixed

- **Out-of-order screencast frames** (`recorder/capture.mjs`): an older frame delivered under heavy load no
  longer replaces a newer one (a lost sync flash once failed a take); the count is in `take.json`
  `capture.outOfOrderFrames`.
- **Sync anchors on three-flash takes**: the example storyboard used `sync:start` / `sync:end`, which current
  takes do not have; it now uses `keep:from` / `keep:to`, and a bare `sync:start` / `sync:end` still resolves to
  the flashes.
- A pointer move in flight at a range's first frame is drawn to its target instead of stranded mid-path, and
  the audit no longer mistakes other cuts for montage slices.
- `cliArgs` no longer lets a value option swallow the next flag (`make-placeholder.mjs 1 --creatives --project
  <dir>` honours `--project`).
- `hyperframes transcribe --json` prints a summary, not the words: `voiceover/README.md`, `place.py` and the
  `voiceover` skill now use `--dir voiceover` and read `voiceover/transcript.json`.
- `delivery/html2pdf.mjs`, `md2html.py`, `showcase_sheet.py` and `zip.sh` answer `--help` with exit 0.
- **`walkthrough render` kept or replaced builds silently** (`cli/commands/render.mjs`, `cli/lib/film.mjs`):
  `--aspect`, `--fit-audio`, `--fit-gap` and `--fit-max` went to `hyperframes render` instead of the build, so
  its automatic rebuild dropped them and replaced a build made with them, and a change of aspect alone
  triggered no rebuild. `render` now takes the build flags (`--aspect`, `--fit-audio`, `--fit-gap`,
  `--fit-max`, `--brand`, `--takes`) and passes them to its build; `state.builds[]` records each build's
  resolved aspect, brand file and sha256, takes folder and fit-audio placement (file, sha256, gap, max); and
  `render` rebuilds when any of them differs from the build on disk (the aspect is read from `index.html`'s
  canvas), printing each input that changed. `--no-captions` no longer rebuilds when the build on disk is
  already the current captionless twin, and `render --no-build` warns when the build differs from its inputs.
  `walkthrough build` takes `--aspect` and `--fit-audio` as its own flags so they are recorded.
- **Mock speech could reach a real voiceover** (`voiceover/tts.mjs`, `cli/commands/vo.mjs`): `ELEVENLABS_MOCK`
  audio was cached under the key of the real line, so a later real run reused the tone, and its `[mock]`
  cost rows were folded into `state.json`. Mock runs now key the cache by the mock mode (and the contents of
  `ELEVENLABS_MOCK_FILE`), keep it in `voiceover/cache-mock/`, mark `lines/manifest.json` with `"mock"` (a
  real run treats those line files as stale, not as dropped-in audio), print a `MOCK … NOT REAL SPEECH`
  banner, and mark their cost rows `"mock": true`; `vo` and `sound` skip such rows when folding costs. A
  mock is now safe in the project's own `voiceover/`. New projects ignore `voiceover/cache-mock/`.

## [0.1.0] - 2026-11-09

The first release: the kit, extracted from a real client walkthrough job (6-9 November 2026); the example here
is anonymised as Brightpost.

### Added

- **Recorder** (`recorder/`): Playwright with full Chromium in new-headless mode and the GPU, a DevTools
  screencast at 60 fps with frames slotted by browser timestamp, three sync flashes at each end, a heartbeat
  pixel, cursor-free footage and an `events.json` action log (contract `walkthrough-take/1`; take readers
  accept only that schema id, and any other stops the build). An invisible mouse on the same arcs the film draws.
- **Site mode**: any URL, no studio. Declarative scenes as a `.json` list of steps, `storageState`,
  `blockUrls`, `dismiss`, the generic `waitQuiet` wait, safe-area scrolling (`scrollIntoViewSafe`), marks that
  log the element's visible text, viewport presets `desktop` (1440x810 @2) and `phone` (390x844 @3), and
  `npm run site-test` (in `recorder/`) as an end-to-end check.
- **Take runner** (`recorder/takes/run.mjs`): one session for many takes, go files or `--auto`, checkpoints,
  status files and contact sheets; recorder tools `inspect.mjs`, `explore.mjs`, and `save-login.mjs` (save a
  signed-in browser state for site mode; the owner signs in by hand).
- **Studio** (`studio/`): an APFS-clone instance of an owned app with its own data and ports, a production
  build, checkpoints and restores that only touch the processes they started.
- **Film kit** (`film/`): `build.mjs` writes HyperFrames compositions from `storyboard.json` and the take
  logs, with a drawn pointer, camera, spotlights, captions, transitions, title and end card; one source-to-film
  mapping; `brand.json`; `draft-storyboard.mjs`; `--dry`, `--audit` (holds, pointer jumps at cuts, dead air,
  caption lint, caption claims against mark text) and the `--no-captions` twin.
- **Project folders**: the film and sound builds run from a folder outside the kit
  (`film/scripts/init-project.mjs`, `--project`, `FILM_PROJECT`); the kit stays read-only in use.
- **Sound** (`sound/`): a music bed fitted by bar-aligned loops, effects on the cues, a voiceover mix with
  ducking, −16 LUFS, and the `delivered:` guard.
- **Voiceover** (`voiceover/`): script fitting, placement from one TTS take, re-timing fit checks, twin
  comparison.
- **Delivery** (`delivery/`): masters and web encodes, feature clips, stills, contact and showcase sheets,
  README to HTML and PDF, inventory, verify, zip.
- **Plugin**: 7 skills and 9 agents with model tiers; `.claude-plugin/plugin.json` (with `license`,
  `repository` and a 1024 px `icon.png`) and `.claude-plugin/marketplace.json`, so the repo is its own
  marketplace for Claude Code and Codex. A copy-writing step in the `build-film` skill, and the HyperFrames
  skills listed as prerequisites.
- **Install on six agents**: `docs/INSTALL.md` (Claude Code, skills.sh, Codex, Cursor, Antigravity, Hermes)
  and `docs/INSTALL-RESEARCH.md` (the verified research and compatibility matrix). Every skill finds the kit
  through `${CLAUDE_PLUGIN_ROOT}`, `$WALKTHROUGH_STUDIO_HOME`, `~/walkthrough-studio` or its own `../..`, and
  asks for a clone when only the `SKILL.md` files were installed; without sub-agents the lead does each
  agent's role from `agents/<name>.md`.
- **Docs**: an index by purpose (`docs/README.md`), pipeline, take contract, capture test, storyboard, look,
  delivery, lessons, roadmap, `docs/ELEVENLABS.md` (the connector and API-key routes for music and speech),
  architecture decision records 001-009 (`docs/adr/`), this changelog, a first tutorial (a 60-second captioned
  site tour, `docs/TUTORIAL-first-site-tour.md`), and the first project as a worked example
  (`examples/brightpost/`: a fictional marketing-post studio for independent shops, the shop Harbor Bikes; the
  client's names, products, brand colour and fixtures are replaced everywhere, including the sample pages and
  tests in `recorder/`).
- MIT licence (`LICENSE`); `license` and `repository` in the package manifests.
- `scripts/version.mjs` and `npm run version:set -- X.Y.Z`: one semver version across `plugin.json`,
  `marketplace.json`, the root, `recorder/` and `film/` `package.json`; it moves `[Unreleased]` into the new
  version's section, updates the compare links and prints the release commands. `--dry`, `--notes`,
  `--verify`, `--current`.
- `npm run check` (`scripts/check.mjs`): syntax of every `.mjs`, `.py`, `.sh` and `.json`, skill and agent
  frontmatter (`scripts/lint-skills.mjs`, also `npm run lint:skills`), version agreement and
  `claude plugin validate . --profile directory`. `npm run check:site` builds the website from a clean install.
- GitHub Actions: `ci.yml` (jobs `check`, `site`, `skills-lint` on pull requests and pushes to `main`) and
  `release.yml` (a `v*` tag becomes a GitHub Release with that version's changelog section).
- Contribution files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `SECURITY.md`
  (GitHub private vulnerability reporting), issue and pull-request templates, `CODEOWNERS`, Dependabot for
  npm and GitHub Actions, `.editorconfig`, `.nvmrc` (Node 24); `docs/MAINTAINERS.md` (the ruleset that
  protects `main`, repository settings, the release procedure).

### Fixed

- The master-sync check reported false −9 frame errors on static pages; it now needs a rising edge.
- Every delivery and voiceover script answers `--help`.
- `delivery/zip.sh` handles relative paths.
- `delivery/clips.py --dry` no longer has side effects.
- `${VAR}` is expanded in every delivery path; the example's paths come from `BRIGHTPOST_REPO`.
- `docs/ELEVENLABS.md` downloaded files into the kit's `film/`; it now uses the film's project folder.

[Unreleased]: https://github.com/gabros20/walkthrough-studio/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/gabros20/walkthrough-studio/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/gabros20/walkthrough-studio/releases/tag/v0.1.0
