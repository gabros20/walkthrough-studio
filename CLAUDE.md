# Operating rules for agents in this repo

This repo is `walkthrough-studio`: a toolkit (and Claude Code plugin) for agent-made app walkthrough films.
It is used against *other* projects' apps. The rules below protect those projects and their owners.

## Where things live

| Path | What |
|---|---|
| `skills/<name>/SKILL.md` | workflows; start with `skills/walkthrough-film` |
| `agents/<name>.md` | specialised agent roles with their model tier |
| `docs/` | `PIPELINE.md` (overview), `LESSONS.md` (read before planning), `CONTRACT.md`, `CAPTURE_TEST.md`, `STORYBOARD.md`, `LOOK.md`, `DELIVERY.md`, `ELEVENLABS.md` |
| `studio/` | isolated app instance scripts (clone, ports, checkpoints) |
| `recorder/` | Playwright capture, invisible-mouse driving, `events.json` take format, take runner |
| `film/` | HyperFrames film kit: `build.mjs`, components, review scripts |
| `sound/` | music bed, effects, mix, mux with `delivered:` |
| `voiceover/` | script fitting, placement, re-timing fit check |
| `delivery/` | package scripts: films, clips, stills, sheets, README html/pdf, verify, zip |
| `examples/kleber-content-ai/` | the first real project: plan, configs, storyboard, voiceover, delivery copy, agent briefs |

## Guardrails

- Never print secret values: names only. Never store secrets, `.env` contents, tokens or one-time links in
  docs, examples, logs or project memory. `link.txt` files are git-ignored and read by code only.
- Never stop, restart or reconfigure the owner's own dev servers; never write into an app repo's `data/`.
  The studio instance is the only thing this pipeline may start, stop, checkpoint or restore, and only the
  agent that owns it at that moment.
- Footage, renders, audio, frame caches and packages stay out of git (see `.gitignore`). Do not commit a
  file larger than a few MB without asking.
- Commit messages end with the session line the host provides. Large pushes:
  `git -c http.postBuffer=524288000 push`. Never force-push.
- Sound must be verified present on any delivered video (`delivered:` line, `delivery/verify.py`). Audio is
  reported as "measured, not heard".
- Honesty in films: time-lapses labelled, nothing mocked, a caption or line is cut when its claim is not
  visibly true in the take; fictional companies and generated media are disclosed in the package.
- Paid generations (music, speech, real agent turns) are budgeted; never repeat a call after "busy" in the
  same turn; never generate extra takes "to compare" without the owner's go-ahead.
- In shell commands use `/bin/rm` and `/usr/bin/zip` (zsh aliases broke them). Run Python with `python3 -I`.
- Do not publish, upload or share anything (packages, films, artifacts) without the owner's go-ahead.

## Before claiming done

- Changed a script: run it (or its `--dry`/`--help`) on real or sample input and read the output.
- Changed `skills/`, `agents/` or `.claude-plugin/`: `claude plugin validate .` must pass.
- Changed `delivery/`: `KLEBER_REPO=<kleber-content-ai checkout> python3 -I delivery/clips.py examples/kleber-content-ai/delivery/package.config.json --dry`
  (needs the example's source films; otherwise test on any film with an `edl.json`); every script answers `--help`.
- Changed `film/`: `node film/build.mjs --dry` on the example storyboard when takes are available, and
  `npx hyperframes@0.9.16 check` in `film/`.
- Grep your diff for secrets and personal data (`@gmail`, `sk-`, `token`, `link.txt` contents) before committing.
