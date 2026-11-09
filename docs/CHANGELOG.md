# Changelog

All notable changes to this kit. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [semver](https://semver.org/) and are set with `scripts/version.mjs` (see `docs/MAINTAINERS.md`).

## [Unreleased]

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

[Unreleased]: https://github.com/gabros20/walkthrough-studio/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/gabros20/walkthrough-studio/releases/tag/v0.1.0
