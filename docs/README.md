# Documentation

Each doc serves one purpose ([Diátaxis](https://diataxis.fr/)): learning, doing a task, looking something up,
or understanding why. Start with the tutorial if you are new; agents start with the `walkthrough-film` skill
and read the docs their step needs. Paths: `$KIT` is the kit, `$P` a film's project folder.

## Tutorial (learning)

| Doc | What you get |
|---|---|
| [TUTORIAL-first-site-tour.md](TUTORIAL-first-site-tour.md) | From zero to a 60-second captioned tour of a public website in site mode, every command shown. |

## How-to guides (a task)

| Doc | Task |
|---|---|
| [ELEVENLABS.md](ELEVENLABS.md) | Generate the music take and the voiceover take, through the connector or with an API key. |
| [DELIVERY.md](DELIVERY.md) | Build, check and zip the delivery package (also the reference for its structure and encodes). |
| [`skills/*/SKILL.md`](../skills/) | The agent workflows step by step: `walkthrough-film` (the whole job), `record-takes`, `build-film`, `review-film`, `film-sound`, `voiceover`, `deliver-package`. |
| [`studio/README.md`](../studio/README.md) | Set up a studio instance, checkpoint and restore it. |
| [`voiceover/README.md`](../voiceover/README.md) | Write, generate, place and re-fit a voiceover. |

## Reference (lookup)

| Doc | Defines |
|---|---|
| [CONTRACT.md](CONTRACT.md) | The take format (`walkthrough-take/1`): folder, `master.mp4`, clock, `events.json` event types, `take.json`, `takes/INDEX.md`, the take API. |
| [STORYBOARD.md](STORYBOARD.md) | `storyboard.json`: the mapping, anchors and refs, scene keys, what the build writes, drafting and the audit. |
| [LOOK.md](LOOK.md) | The design system: canvas, window, type, accent, lockup, pointer, camera, spotlight, captions, eases, transitions, cards, banned list, honesty rules. |
| [`recorder/README.md`](../recorder/README.md) | Recorder config keys, viewport presets, adapter and scenes modules, site-mode steps and targets, the take runner, driving rules. |
| [`film/README.md`](../film/README.md) | Project folders, film commands, brand file, creatives, components (`lib/`), scripts. |
| [`sound/README.md`](../sound/README.md) | `build-sound.mjs` options and outputs, `music.json`, the bed fit, effects, voiceover mix, the delivery guard. |
| [`delivery/README.md`](../delivery/README.md) | Delivery scripts, their flags and `package.config.json`. |

## Explanation (understanding)

| Doc | Explains |
|---|---|
| [PIPELINE.md](PIPELINE.md) | How a job runs from plan to delivery, the numbers that worked, and which model tier does what. |
| [CAPTURE_TEST.md](CAPTURE_TEST.md) | How the capture method was chosen, the measurements, and how to re-run the test. |
| [LESSONS.md](LESSONS.md) | What went wrong on the first film, the fix for each, and where the fix lives. Read before planning. |
| [ROADMAP.md](ROADMAP.md) | What is planned and not built, by value per effort. |
| [adr/](adr/) | Architecture decision records: the hard-to-reverse choices and the alternatives rejected (below). |

### Decisions

| ADR | Decision |
|---|---|
| [001](adr/001-footage-without-cursor.md) | Footage without a cursor plus an `events.json` log; pointer, camera and captions drawn afterwards. |
| [002](adr/002-cdp-screencast-capture.md) | CDP screencast at 2x, browser timestamps into constant 60 fps slots. |
| [003](adr/003-hyperframes-data-generated-film.md) | HyperFrames with generated compositions and one source-to-film mapping. |
| [004](adr/004-sandboxed-studio-and-checkpoints.md) | A sandboxed studio instance with APFS-clone checkpoints; bad takes redone, never patched. |
| [005](adr/005-music-after-picture-lock.md) | Music after picture lock, fitted by bar-aligned loops instead of regenerating. |
| [006](adr/006-delivered-audio-guard.md) | Nothing is delivered without the `delivered:` line. |
| [007](adr/007-project-folders-outside-the-kit.md) | Each film in a project folder outside the kit; the kit is read-only in use. |
| [008](adr/008-model-tier-orchestration.md) | Model-tier orchestration with an Opus critic and fixed honesty rules. |
| [009](adr/009-anchor-by-type-and-label.md) | Anchor the edit by (type, label), never by id or time. |

A decision that changes gets a new ADR that supersedes the old one; old ADRs are kept.

## Also

- [CHANGELOG.md](CHANGELOG.md): what each version contains and fixes.
- [`examples/brightpost/`](../examples/brightpost/): the first real project, with its plan,
  configs, storyboard, voiceover, delivery copy and agent briefs.
- [`CLAUDE.md`](../CLAUDE.md): operating rules for agents in this repo.
