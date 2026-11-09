# Operating rules for agents in this repo

This repo is `walkthrough-studio`: a toolkit (and Claude Code plugin) for agent-made app walkthrough films.
It is used against *other* projects' apps. The rules below protect those projects and their owners.

## Where things live

| Path | What |
|---|---|
| `skills/<name>/SKILL.md` | workflows; start with `skills/walkthrough-film`. Each finds the kit as `${CLAUDE_PLUGIN_ROOT}`, `$WALKTHROUGH_STUDIO_HOME`, `~/walkthrough-studio` or its own `../..` (keep that block identical in all 7) |
| `agents/<name>.md` | specialised agent roles with their model tier |
| `docs/` | `README.md` (index by purpose), `PIPELINE.md` (overview), `LESSONS.md` (read before planning), `CONTRACT.md`, `CAPTURE_TEST.md`, `STORYBOARD.md`, `LOOK.md`, `DELIVERY.md`, `ELEVENLABS.md`, `CLI.md` (the `walkthrough` CLI and `state.json`), `CAPTIONS.md`, `REVIEW.md`, `VOICE.md`, `INSTALL.md` (per-platform install; `INSTALL-RESEARCH.md` is the why), `ROADMAP.md` (what is open), `DESIGN-batch-2.md` (design of the 0.2.0 work), `adr/` (decisions: do not re-litigate without a superseding ADR), `CHANGELOG.md`, `TUTORIAL-first-site-tour.md` |
| `studio/` | isolated app instance scripts (clone, ports, checkpoints) |
| `recorder/` | Playwright capture, invisible-mouse driving, `events.json` take format, take runner |
| `film/` | HyperFrames film kit: `build.mjs`, components in `lib/`, caption drafting, audit, review bundle |
| `sound/` | music bed, music generation and beat grid, effects, mix, mux with `delivered:` |
| `voiceover/` | script fitting, per-line TTS with a cache, lexicon, translations, placement, listening proxy |
| `delivery/` | package scripts and presets (`sales`, `web`, `social`, `docs`): films, clips, stills, sheets, README html/pdf, verify, zip |
| `test/` | the golden test of the film build (`test/run.mjs`, fixture, `test/golden/`) |
| `bin/walkthrough.mjs`, `cli/` | the `walkthrough` CLI over all of the above (`docs/CLI.md`); one file per command in `cli/commands/`, shared helpers in `cli/lib/`; only the CLI writes a project's `state.json` |
| `examples/brightpost/` | the first real project, anonymised: plan, configs, storyboard, voiceover, delivery copy |

## Guardrails

- Never print secret values: names only. Never store secrets, `.env` contents, tokens or one-time links in
  docs, examples, logs or project memory. `link.txt` files are git-ignored and read by code only.
- Never stop, restart or reconfigure the owner's own dev servers; never write into an app repo's `data/`.
  The studio instance is the only thing this pipeline may start, stop, checkpoint or restore, and only the
  agent that owns it at that moment.
- Footage, renders, audio, frame caches and packages stay out of git (see `.gitignore`). Do not commit a
  file larger than a few MB without asking.
- Commit messages end with the session line the host provides. Large pushes:
  `git -c http.postBuffer=524288000 push`. Never force-push except the documented maintainer squash in
  `docs/MAINTAINERS.md`.
- Sound must be verified present on any delivered video (`delivered:` line, `delivery/verify.py`). Audio is
  reported as "measured, not heard".
- Honesty in films: time-lapses labelled, nothing mocked, a caption or line is cut when its claim is not
  visibly true in the take; fictional companies and generated media are disclosed in the package.
- Paid generations (music, speech, real agent turns) are budgeted; never repeat a call after "busy" in the
  same turn; never generate extra takes "to compare" without the owner's go-ahead.
- In shell commands use `/bin/rm` and `/usr/bin/zip` (zsh aliases broke them). Run Python with `python3 -I`.
- Do not publish, upload or share anything (packages, films, artifacts) without the owner's go-ahead.

## Before claiming done

- `npm run check` must pass: syntax of every `.mjs`, `.py`, `.sh` and `.json`, skill and agent frontmatter,
  version agreement, `docs/CLI.md` equal to `walkthrough help --all` (after changing a command's usage, run
  `node scripts/cli-docs.mjs`), and `claude plugin validate .` when `claude` is on the PATH.
- `npm test` must pass: the golden test builds a fixture with `film/build.mjs --dry` and `--emit-only` and
  compares `edl.json`, `cues.json`, `captions.srt` and the composition hashes with `test/golden/`. Code in
  `film/lib` and `film/build.mjs` is golden-tested: a change that moves the output must be deliberate, and
  then you update the goldens with `npm run test:update` (it prints the diff; read it) and say why in the
  commit. `npm run test:render` (local) compares rendered frames too.
- Use the CLI (`node bin/walkthrough.mjs …`) the way the skills do when you test a flow; each command prints
  the tool command it runs, so a failure can be reproduced without it.

- Changed a script: run it (or its `--dry`/`--help`) on real or sample input and read the output.
- Changed `skills/`, `agents/` or `.claude-plugin/`: `claude plugin validate .` must pass. Skills must also work
  installed alone (skills.sh copies only `SKILL.md`, with no agents): kit paths go through `$KIT`, and each
  agent step names its `agents/<name>.md` fallback. Install changes go in `docs/INSTALL.md` and the README.
- Changed `delivery/`: `BRIGHTPOST_REPO=<brightpost checkout> python3 -I delivery/clips.py examples/brightpost/delivery/package.config.json --dry`
  (needs the example's source films; otherwise test on any film with an `edl.json`); every script answers `--help`.
- Changed `film/`: `node film/build.mjs <storyboard.json> --takes <takes> --dry --audit` on a real storyboard
  and its takes (the example's, or a draft from `film/scripts/draft-storyboard.mjs`; a bare
  `node film/build.mjs --dry` in the kit finds no storyboard), and `npx hyperframes@0.9.16 check` in `film/`.
- Grep your diff for secrets and personal data (`@gmail`, `sk-`, `token`, `link.txt` contents) before committing.
