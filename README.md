# walkthrough-studio

A toolkit and Claude Code plugin that lets coding agents make walkthrough and tour videos of a web app or
website, in the style of Screen Studio: real app footage with a drawn pointer, camera punch-ins, captions or
an ElevenLabs voiceover, music, and a title and end card.

Playwright drives the app with an invisible mouse and logs every action to `events.json`. The footage has no
cursor; the pointer, the camera and the captions are drawn afterwards from that log in a HyperFrames edit, so
re-cutting a scene never puts them out of sync. Music and an optional voiceover are made after picture lock,
and a delivery package (films, clips, stills, showcase sheets, copy) is built for the people who will present
it. A lead agent plans and reviews; specialised agents on cheaper or stronger models do each step.

Website: <https://walkthrough-studio-chi.vercel.app> (source in [`site/`](site/))

## What it produced

The first film (6 November 2026): 3:02 at 1920x1080 and 60 fps, in two variants with the same picture:
**captions + music** and **voiceover + ducked music, no captions**. The kit was extracted from a real client
walkthrough job; the example here is anonymised as *Brightpost*, a fictional marketing-post studio for
independent shops. Real app footage only, agent waits shown as labelled time-lapses, −16 LUFS. It was cut
from nine takes recorded on a studio copy of the app over several passes (a switch of capture method, a full
retake after eight app fixes the film exposed, one scene retaken after the owner's review) and shipped as a
361-file delivery package. The plan, configs, storyboard, voiceover and delivery copy are in [`examples/brightpost/`](examples/brightpost/).

## Prerequisites

- macOS. The studio uses APFS clones; elsewhere `studio/bin/lib.sh` falls back to a reflink or a plain copy
  (slower, uses real disk space).
- Node 22 or newer (developed on 24), ffmpeg 8 with ffprobe, Python 3 with `numpy` and `Pillow`
  (`scipy` and `soundfile` too if you measure a new music track with `sound/analysis/`).
- HyperFrames, pinned: every command runs `npx --yes hyperframes@0.9.16 …`.
- The HyperFrames skills `/hyperframes`, `/media-use` and `/hyperframes-cli` in Claude Code; the film and
  sound steps load them. Install or refresh them yourself with `npx hyperframes skills update`, then start a
  new session. Agents tell you to run it; they never install skills themselves. Without them, `film/CLAUDE.md`
  and `docs/LOOK.md` carry the render-contract basics, and `render` still works.
- ElevenLabs for music and voice: the claude.ai ElevenLabs connector (what the first film used) or an API key
  in your environment (`ELEVENLABS_API_KEY`). Both routes: [`docs/ELEVENLABS.md`](docs/ELEVENLABS.md). Any
  WAV or MP3 with a steady tempo and a real ending works for the music instead.
- Optional: `gh`, for pushing fixes to the target app in studio mode.

## Install

Below, `$KIT` is the folder this repo is in.

```bash
git clone https://github.com/gabros20/walkthrough-studio.git && cd walkthrough-studio
npm run setup               # recorder dependencies + Playwright Chromium (also used for PDFs)
claude plugin validate .    # checks the plugin manifest, skills and agents
```

Load it as a plugin for one session with `claude --plugin-dir $KIT`, or install it through a marketplace that
lists this repo (`claude plugin marketplace add <source>`, then
`claude plugin install walkthrough-studio@<marketplace>`). You can also symlink only the parts you want:

```bash
for s in skills/*/; do ln -s "$PWD/$s" ~/.claude/skills/"$(basename "$s")"; done
for a in agents/*.md; do ln -s "$PWD/$a" ~/.claude/agents/; done
```

> [!NOTE]
> The skills look for the kit two folders above their own. With symlinked skills that points into
> `~/.claude`, so tell the session where `$KIT` is.

## Quick start: tour a website (site mode)

Ask for the film in Claude Code and the `walkthrough-film` skill runs the whole job. To run the steps
yourself, follow [`docs/TUTORIAL-first-site-tour.md`](docs/TUTORIAL-first-site-tour.md): a 60-second
captioned tour of a public website. In short, with `P` = a project folder outside the kit:

```bash
mkdir -p $P && cp $KIT/recorder/site-test/walkthrough.config.mjs $KIT/recorder/site-test/scenes.json $P/
# edit baseUrl, takesDir ("./takes"), dismiss, blockUrls and the scenes
node $KIT/recorder/tools/inspect.mjs --config $P/walkthrough.config.mjs --path / --out $P/inspect
node $KIT/recorder/takes/run.mjs --config $P/walkthrough.config.mjs --auto
node $KIT/film/scripts/init-project.mjs $P
node $KIT/film/scripts/draft-storyboard.mjs $P/takes/<take> [$P/takes/<take> ...] --out $P/storyboard.json
cd $P
node $KIT/film/build.mjs --dry --audit            # durations table + audit, no files written
node $KIT/film/scripts/sync-assets.mjs            # brand.json logo + creatives.json -> assets/
node $KIT/film/build.mjs --audit
npx --yes hyperframes@0.9.16 check --json
npx --yes hyperframes@0.9.16 render -o renders/final.mp4 --fps 60
for f in cues.json edl.json; do cp $f renders/final.$f; done; cp captions.srt renders/final.captions.srt
node $KIT/sound/build-sound.mjs --video renders/final.mp4 --deliver out/<film>.mp4
```

The last line of the sound build must read `delivered: <path>`. If the site needs a sign-in, save one first
with `node $KIT/recorder/tools/save-login.mjs --url <sign-in page> --until <URL part after sign-in> --out
$P/login.storage.json` (the owner signs in by hand) and pass it to the runner with `--storage`. From outside
`$P`, add `--project $P` to each film and sound command or set `FILM_PROJECT=$P`. The kit itself is never
written to ([ADR-007](docs/adr/007-project-folders-outside-the-kit.md)).

## Studio mode: an app you own

1. Copy `examples/brightpost/` into a project folder outside the kit (for example inside your app's
   repo) and edit:
   - `studio.config.sh`: source repo, studio folder, data dirs to checkpoint, services, ports, build command,
     env ([`studio/README.md`](studio/README.md));
   - `walkthrough.config.mjs`: base URL, viewport, takes folder, adapter, scenes; point `studio.bin` at
     `$KIT/studio/bin` (the example's relative path only resolves inside the kit);
   - `app.mjs` (the adapter: sign-in, sending a request, waiting for results) and `scenes.mjs`;
   - `brand.json` (colours, font, lockup with your real logo files) and later `storyboard.json`;
   - `delivery/package.config.json` once films exist.
2. In Claude Code, in your app's repo, ask for the film. The `walkthrough-film` skill takes over: plan,
   approval, studio, capture test, takes, cut, review, sound, voiceover, delivery.

[`examples/brightpost/PLAN.md`](examples/brightpost/PLAN.md) is the best template for a plan:
story table, look numbers, pointer, camera and caption rules, takes and checkpoints, risks.

## Two modes, two voices

| | Studio mode | Site mode |
|---|---|---|
| For | an app whose code you own and run locally | any URL: production, staging, docs, a third-party site |
| Instance | APFS clone + own data, separate ports, production build, checkpoints (`studio/`) | none |
| Login | demo account, one-time link, checkpoint CP0 | test account signed in once, saved `storageState` |
| Clean frame | production build, no dev badges | consent and cookie banners dismissed from a list |
| Waiting | app-specific turn detection in an adapter | generic `waitQuiet` (network idle + no DOM changes) |
| Bad take | restore the checkpoint, redo | idempotent scenes, or reset by hand |

Decide **captions or voiceover** before the storyboard: captions play muted and holds are sized for reading;
a voiceover needs holds sized for speech, a script, one paid TTS take and a ducked mix. Both can come from one
picture lock (`build.mjs --no-captions` gives the captionless twin with identical timing). The
`walkthrough-film` skill walks through both decisions.

## Pipeline

```
 plan ─> studio | site login ─> capture test ─> rehearse ─> takes (CP0..CPn) ─> rough cut ─> captions/title/end
                                               ^   │                                 │
                               app fixes ──────┘   └─ retake from a checkpoint       v
 delivery <─ review <─ voiceover twin <─ sound <─ picture lock <─ review loop (describers, critic, holds)
```

| Folder | What it does | Reference |
|---|---|---|
| `studio/` | sandboxed app instance: APFS clone, own data, separate ports, production build, checkpoints | [`studio/README.md`](studio/README.md) |
| `recorder/` | Playwright new-headless with GPU, desktop (1440x810 @2x) or phone (390x844 @3x), CDP screencast at 60 fps, invisible mouse on arcs, `events.json`, site-mode steps, `waitQuiet`, safe-area scrolling | [`recorder/README.md`](recorder/README.md), [`docs/CONTRACT.md`](docs/CONTRACT.md) |
| `film/` | storyboard drafted from takes, `build.mjs` → HyperFrames compositions, one source→film mapping, `--audit`, `--no-captions` twin, scene sheets | [`film/README.md`](film/README.md), [`docs/STORYBOARD.md`](docs/STORYBOARD.md), [`docs/LOOK.md`](docs/LOOK.md) |
| `sound/` | music bed fitted by bar-aligned loops, clicks, whooshes, riser, −16 LUFS, ducking, the `delivered:` guard | [`sound/README.md`](sound/README.md) |
| `voiceover/` | script fitted to EDL windows, one TTS take, placement, re-timing fit check | [`voiceover/README.md`](voiceover/README.md) |
| `delivery/` | masters and web encodes, clips, cropped stills, showcase sheets, README md/html/pdf, verify, zip | [`delivery/README.md`](delivery/README.md), [`docs/DELIVERY.md`](docs/DELIVERY.md) |
| `skills/`, `agents/`, `.claude-plugin/` | 7 skills, 9 agent definitions, the plugin manifest | below |
| `examples/brightpost/` | the first real project, anonymised | [its README](examples/brightpost/README.md) |

How the stages fit together and the numbers that worked: [`docs/PIPELINE.md`](docs/PIPELINE.md). What went
wrong the first time and the fix for each: [`docs/LESSONS.md`](docs/LESSONS.md).

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
| `delivery-packager` | opus; the lead spawns it on sonnet for media mode | the delivery package |

## How the orchestration works

The main session (the most capable model) only plans, briefs, rules and checks. Complex code and
client-facing text go to Opus agents; mechanical, self-checking work to Sonnet; "what is on screen at 1:03?"
to Haiku, three at a time on disjoint ranges; and an Opus critic checks the small models' output before anyone
acts on it. Critical reviews are never skipped; everything else spends as few tokens as it can. Agents are
long-lived and named, so the lead can send numbered rulings to the editor or a retake request to the take
operator without re-briefing. Long reports come back as files. Why: [ADR-008](docs/adr/008-model-tier-orchestration.md).
The roles and their briefs live in [`agents/`](agents/).

## Documentation

[`docs/README.md`](docs/README.md) lists every doc by purpose (tutorial, how-to, reference, explanation),
including the architecture decision records in [`docs/adr/`](docs/adr/) and the
[changelog](docs/CHANGELOG.md). What is planned but not built (only 16:9 films today, caption drafting,
multi-tab flows, one CLI, package presets) is in [`docs/ROADMAP.md`](docs/ROADMAP.md). Rules for agents
working in this repo: [`CLAUDE.md`](CLAUDE.md).

## Generated media and licence

No licence has been chosen for the code yet. Music and voice generated through ElevenLabs are governed by the
terms of the plan they were generated under (the free tier's terms for commercial use were not verified for
the first film); confirm them before publishing. Brand assets, logos and app footage belong to their owners
and are not in this repo: the example's `brand.json` points at the client's files through an environment
variable.
