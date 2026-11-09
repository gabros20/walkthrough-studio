# Changelog

All notable changes to this kit. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow `package.json`.

## [Unreleased]

### Added

- Documentation index by purpose (`docs/README.md`), architecture decision records 001-009 (`docs/adr/`),
  this changelog, and a first tutorial: a 60-second captioned site tour (`docs/TUTORIAL-first-site-tour.md`).

### Changed

- README reordered: what it is, install, quick start for site mode (now including the recording, inspect and
  creatives steps), studio mode, then reference material.

### Fixed

- `docs/ELEVENLABS.md` downloaded files into the kit's `film/`; it now uses the film's project folder.

## [0.1.0] - 2026-11-09

The kit extracted from the Kleber Content AI walkthrough job (6-9 November 2026).

### Added

- **Recorder** (`recorder/`): Playwright with full Chromium in new-headless mode and the GPU, a DevTools
  screencast at 60 fps with frames slotted by browser timestamp, three sync flashes at each end, a heartbeat
  pixel, cursor-free footage and an `events.json` action log (contract `walkthrough-take/1`, readers also
  accept `kleber-take/1`). An invisible mouse on the same arcs the film draws.
- **Site mode**: any URL, no studio. Declarative scenes as a `.json` list of steps, `storageState`,
  `blockUrls`, `dismiss`, the generic `waitQuiet` wait, safe-area scrolling (`scrollIntoViewSafe`), marks that
  log the element's visible text, viewport presets `desktop` (1440x810 @2) and `phone` (390x844 @3), and
  `npm run site-test` (in `recorder/`) as an end-to-end check.
- **Take runner** (`recorder/takes/run.mjs`): one session for many takes, go files or `--auto`, checkpoints,
  status files and contact sheets; recorder tools `inspect.mjs`, `explore.mjs`.
- **Studio** (`studio/`): an APFS-clone instance of an owned app with its own data and ports, a production
  build, checkpoints and restores that only touch the processes they started.
- **Film kit** (`film/`): `build.mjs` writes HyperFrames compositions from `storyboard.json` and the take
  logs, with a drawn pointer, camera, spotlights, captions, transitions, title and end card; one source-to-film
  mapping; `brand.json`; `draft-storyboard.mjs`; `--dry`, `--audit` (holds, pointer jumps at cuts, dead air,
  caption lint, caption claims against mark text) and the `--no-captions` twin.
- **Sound** (`sound/`): a music bed fitted by bar-aligned loops, effects on the cues, a voiceover mix with
  ducking, −16 LUFS, and the `delivered:` guard.
- **Voiceover** (`voiceover/`): script fitting, placement from one TTS take, re-timing fit checks, twin
  comparison.
- **Delivery** (`delivery/`): masters and web encodes, feature clips, stills, contact and showcase sheets,
  README to HTML and PDF, inventory, verify, zip.
- **Plugin**: 7 skills and 9 agents with model tiers, `.claude-plugin/plugin.json`.
- **Docs**: pipeline, take contract, capture test, storyboard, look, delivery, lessons, roadmap, and the Kleber
  project as a worked example (`examples/kleber-content-ai/`).
- `recorder/tools/save-login.mjs`: save a signed-in browser state for site mode; the owner signs in by hand.
- `docs/ELEVENLABS.md`: the connector and API-key routes for music and speech.
- **Project folders**: the film and sound builds run from a folder outside the kit
  (`film/scripts/init-project.mjs`, `--project`, `FILM_PROJECT`); the kit stays read-only in use.
- A copy-writing step in the `build-film` skill, and the HyperFrames skills listed as prerequisites.

### Fixed

- The master-sync check reported false −9 frame errors on static pages; it now needs a rising edge.
- Every delivery and voiceover script answers `--help`.
- `delivery/zip.sh` handles relative paths.
- `delivery/clips.py --dry` no longer has side effects.
- `${VAR}` is expanded in every delivery path; the example's paths come from `KLEBER_REPO`.

[Unreleased]: https://github.com/gabros20/walkthrough-studio/compare/f94bd0f...HEAD
[0.1.0]: https://github.com/gabros20/walkthrough-studio/commit/f94bd0f
