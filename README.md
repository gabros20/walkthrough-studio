# walkthrough-studio

A toolkit, and a Claude Code plugin, for coding agents to make Screen-Studio-style walkthrough and tour
videos of any web app or website, with on-screen captions or an ElevenLabs voiceover (or both from one
picture lock). The app (an isolated copy in studio mode, or any URL in site mode) is driven by Playwright with
an invisible mouse while every action is logged; the film is cut in HyperFrames from that log, with a drawn pointer, camera punch-ins, captions
anchored to events, a title and an end card; music and an optional voiceover are generated and mixed after
picture lock; and a delivery package (films, clips, stills, showcase sheets, copy) is built for the people
who will present it. A lead agent orchestrates; specialised agents on cheaper or stronger models do each step.

## What it produced

The first film: *Kleber Content AI walkthrough* (6 November 2026), 3:02 at 1920x1080, 60 fps, in two
variants with the same picture: **captions + music** and **voiceover + ducked music, no captions**. Real app
footage only, agent waits shown as labelled time-lapses, −16 LUFS. It was cut from nine takes recorded on a
studio copy of the app in several passes (a switch of capture method, a full retake after eight app fixes the
film exposed, one scene retaken after the owner's review), and shipped as a 361-file delivery package. The plan, configs, storyboard, voiceover, delivery copy and every
agent brief from that job are in `examples/kleber-content-ai/`.

## Two modes, two voices

| | Studio mode | Site mode |
|---|---|---|
| For | an app whose code you own and run locally | any URL: production, staging, docs, a third-party site |
| Instance | APFS clone + own data, separate ports, production build, checkpoints (`studio/`) | none |
| Login | demo account, one-time link, checkpoint CP0 | test account logged in once, saved `storageState` |
| Clean frame | production build, no dev badges | consent/cookie banners dismissed from a list |
| Waiting | app-specific turn detection in an adapter | generic `waitQuiet` (network idle + no DOM changes) |
| Bad take | restore the checkpoint, redo | idempotent scenes, or reset by hand |

Decide **captions or voiceover** before the storyboard: captions play muted and pace holds for reading; a
voiceover needs holds sized for speech, a script, one paid TTS take and a ducked mix. Both twins can come from
one picture lock (`build.mjs --no-captions` gives the captionless picture with identical timing). The
`walkthrough-film` skill walks through both decisions.

## Pipeline

```
 plan ─> studio | site login ─> capture test ─> rehearse ─> takes (CP0..CPn) ─> rough cut ─> captions/title/end
                                               ^   │                                 │
                               app fixes ──────┘   └─ retake from a checkpoint       v
 delivery <─ review <─ voiceover twin <─ sound <─ picture lock <─ review loop (describers, critic, holds)

 studio/      APFS clone + own DB, separate ports, prod build, telemetry off, checkpoints as clones
 recorder/    Playwright new-headless + GPU, desktop (1440x810 @2x) or phone (390x844 @3x) preset, CDP screencast 60 fps,
              no cursor, invisible mouse on arcs, events.json (walkthrough-take/1), marks with visible text,
              waitQuiet, scrollIntoViewSafe, sync flashes, heartbeat pixel
 film/        draft-storyboard.mjs (from takes) -> refine storyboard.json -> build.mjs -> HyperFrames;
              film = filmIn + (src - srcIn)/rate; --dry, --audit (holds, pointer jumps at cuts, dead air,
              caption lint, caption claims against mark text),
              --no-captions twin, scene sheets
 sound/       music bed fitted by bar-aligned loops, clicks/whooshes/riser, -16 LUFS, ducking, "delivered:"
 voiceover/   script fitted to EDL windows, one TTS take, transcribe -> placement.json, re-timing fit check
 delivery/    masters + web encodes, clips, cropped stills, showcase sheets, README md/html/pdf, verify, zip
```

Details: `docs/PIPELINE.md`. What went wrong the first time and the fix for each: `docs/LESSONS.md`.

## Prerequisites

- macOS (APFS clones for the studio; other systems need a copy-based `studio.config.sh`).
- Node 24 (22+ works for the recorder), ffmpeg 8 with ffprobe, Python 3 with `numpy` and `Pillow`.
- HyperFrames via `npx hyperframes@0.9.16` (pinned), and the `/hyperframes` and `/media-use` skills installed
  in Claude Code (the film and sound steps load them).
- Playwright Chromium: `npm run setup` (= `cd recorder && npm install && npx playwright-core install chromium`).
- ElevenLabs for music and voice: the claude.ai ElevenLabs connector (what the first film used) or an API key
  in your environment. Check the licence terms of your plan before public or commercial use of the output.
- Optional: `gh` for pushing the target app's fixes.

## Install

As a plugin for one session:

```bash
claude --plugin-dir /path/to/walkthrough-studio
```

Or add it permanently through a marketplace that lists this repo (`claude plugin marketplace add <source>`,
then `claude plugin install walkthrough-studio@<marketplace>`), or symlink the parts you want:

```bash
for s in skills/*/; do ln -s "$PWD/$s" ~/.claude/skills/"$(basename "$s")"; done
for a in agents/*.md; do ln -s "$PWD/$a" ~/.claude/agents/; done
```

Check it loads: `claude plugin validate /path/to/walkthrough-studio`.

## Quick start for a new app

Site mode (any URL): write a `walkthrough.config.mjs` with `baseUrl`, `viewport` (`"desktop"`, `"phone"` or a
size), the takes folder, `dismiss` (banner selectors) and `blockUrls`, plus scenes as a `.json` list of
declarative steps (or a JS module using `take.waitQuiet` and `mark`); `recorder/site-test/` is a working
template. If the site needs a login, save one with `recorder/tools/save-login.mjs` (the owner signs in by hand)
and pass it with `--storage`; then ask for the film. No studio and no adapter unless a step needs
code. `recorder/README.md` has the full reference.

Studio mode (an app you own):

1. Copy `examples/kleber-content-ai/` to `examples/<your-app>/` (or keep it in your app's repo) and edit:
   - `studio.config.sh`: source repo, studio folder, data dirs to checkpoint, services, ports, build command,
     env (see `studio/README.md`);
   - `walkthrough.config.mjs`: base URL, viewport, takes folder, adapter, scenes;
   - `app.mjs` (the app adapter: sign-in, sending a request, waiting for results) and `scenes.mjs`;
   - `brand.json` (colours, font, lockup with your real logo files) and later `storyboard.json`;
   - `delivery/package.config.json` once films exist.
2. In Claude Code, in your app's repo, ask for the film; the `walkthrough-film` skill takes over: plan,
   approval, studio, capture test, takes, cut, review, sound, voiceover, delivery.
3. Run `npm run setup` once here for the recorder's browser.

`examples/kleber-content-ai/PLAN.md` is the best template for the plan: story table, look numbers, pointer,
camera and caption rules, takes and checkpoints, risks.

## Skills and agents

| Skill | Use it to |
|---|---|
| `walkthrough-film` | run the whole job as the lead: steps, gates, which agent and model for what, guardrails |
| `record-takes` | studio, capture test, adapter, rehearsals, takes with checkpoints, INDEX.md |
| `build-film` | storyboard, build, drafts, pointer treatments, holds audit, picture lock, captionless twin |
| `review-film` | Haiku describers + Opus critic + rulings loop, contact sheets, holds |
| `film-sound` | one music generation, bed extension, effects, mix, verified delivery |
| `voiceover` | script fitted to windows, one TTS take, placement, re-timing fit checks |
| `deliver-package` | the package: films, clips, stills, showcase, copy, README, verify, zip |

| Agent | Model | Role |
|---|---|---|
| `studio-builder` | sonnet | studio instance, re-sync and rebuild |
| `take-operator` | opus | recorder, capture test, takes, retakes, INDEX.md |
| `film-editor` | opus | components, storyboard, cuts, renders |
| `frame-describer` | haiku | factual frame read-back, run 3 in parallel |
| `film-critic` | opus | independent review; verifies the describers |
| `app-fixer` | opus | fixes app issues the film exposed, verifies on camera, commits |
| `sound-designer` | opus | bed, effects, mix, `delivered:` |
| `voiceover-producer` | opus | narration script and placement |
| `delivery-packager` | sonnet (media) / opus (copy) | the delivery package |

## How the orchestration works

The main session (the most capable model) only plans, briefs, rules and checks. Complex code and
client-facing text go to Opus agents; mechanical, self-checking work to Sonnet; "what is on screen at 1:03?"
to Haiku, three at a time on disjoint ranges; and an Opus critic checks the small models' output before
anyone acts on it. Critical reviews are never skipped; everything else spends as few tokens as it can.
Agents are long-lived and named, so the lead can send numbered rulings to the editor or a retake request to
the take operator without re-briefing. Long reports come back as files. The real briefs and follow-ups are in
`examples/kleber-content-ai/agent-briefs/`.

## Folder map

```
.claude-plugin/plugin.json   plugin manifest
skills/                      7 skills (SKILL.md each)
agents/                      9 agent definitions
docs/                        PIPELINE, LESSONS, CONTRACT, CAPTURE_TEST, STORYBOARD, LOOK, DELIVERY, ROADMAP
studio/                      bin/*.sh, README
recorder/                    capture, motion, take runner, tools
film/                        build.mjs, lib/, scripts/ (holds, scene sheets, assets)
sound/                       build-sound.mjs, analysis/
voiceover/                   make_script.py, place.py, fitcheck.py, remap.py, compare-twins.py
delivery/                    films, clips, stills, sheets, md2html, html2pdf, verify, zip
examples/kleber-content-ai/  plan, configs, adapter, scenes, storyboard, voiceover, delivery, agent-briefs
```

What was folded in during the extraction (site mode, declarative scenes, the drafted storyboard, the build
audit) and what is still open (aspect presets: only 16:9 exists today, see `docs/LOOK.md`; caption drafting,
multi-tab flows, package presets) is in `docs/ROADMAP.md`.

## Generated media and licences

The code in this repo is yours to use; no licence file has been chosen yet. Music and voice generated through
ElevenLabs are governed by the terms of the plan they were generated under (the free tier's terms for
commercial use were not verified for the first film); confirm them before publishing. Brand assets, logos and
app footage belong to their owners and are not in this repo: the example's `brand.json` points at the
client's files through an environment variable.
