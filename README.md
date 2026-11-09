# walkthrough-studio

[![Licence: MIT](https://img.shields.io/github/license/gabros20/walkthrough-studio)](LICENSE)
[![Version](https://img.shields.io/github/v/tag/gabros20/walkthrough-studio?sort=semver&label=version)](https://github.com/gabros20/walkthrough-studio/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/gabros20/walkthrough-studio/ci.yml?branch=main&label=CI)](https://github.com/gabros20/walkthrough-studio/actions/workflows/ci.yml)

A toolkit and Claude Code plugin that lets coding agents make walkthrough and tour videos of a web app or
website, in the style of Screen Studio: real app footage with a drawn pointer, camera punch-ins, captions or
an ElevenLabs voiceover, music, and a title and end card.

Playwright drives the app with an invisible mouse and logs every action to `events.json`. The footage has no
cursor; the pointer, the camera and the captions are drawn afterwards from that log in a HyperFrames edit, so
re-cutting a scene never puts them out of sync. Music and an optional voiceover are made after picture lock,
and a delivery package (films, clips, stills, showcase sheets, copy) is built for the people who will present
it. A lead agent plans and reviews; specialised agents on cheaper or stronger models do each step. One CLI,
`walkthrough`, runs every step from a project folder and keeps the project's state, so a new session picks up
where the last one stopped.

What it does:

- **Point it at anything**: an app you own (a sandboxed studio copy with checkpoints) or any URL (saved login,
  banner dismissal, generic waits); a tour map of the site with drafted scenes; desktop or phone viewports;
  new tabs, downloads and dialogs handled and logged; parallel takes for independent scenes.
- **Cut with less effort**: a storyboard drafted from the action log, captions briefed by a tool and written
  by an agent with every quoted UI string checked against the recording, pointer bridges and fades at cuts,
  16:9, 9:16 and 1:1 films with a phone bezel, and a build audit (holds, pointer jumps, dead air, caption truth).
- **Sound and voice**: a music bed generated once and fitted by bar-aligned loops, a measured beat grid,
  effects on the cues, per-line voiceover with a cache, a pronunciation lexicon, language twins, script-first
  timing where the film makes room for the voice, and a listening proxy (measured, not heard).
- **Review and deliver**: a review bundle per render (contact sheets, cut strips, audit, audio, costs) with a
  static page for the human reviewer; delivery presets for a sales package, web embeds, social clips and
  docs clips with GIFs; a cost ledger and a disk policy that spills renders to an external drive.

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

Full steps, flags and what each platform gets: [`docs/INSTALL.md`](docs/INSTALL.md).

- **Claude Code** (skills, agents and the whole kit). In a session:

  ```text
  /plugin install walkthrough-studio --marketplace gabros20/walkthrough-studio
  ```

  Or in a shell: `claude plugin install walkthrough-studio --marketplace gabros20/walkthrough-studio`. For one
  session from a clone: `claude --plugin-dir ./walkthrough-studio`.
- **Any agent via skills.sh** (the 7 skills; add the kit below):
  `npx skills add gabros20/walkthrough-studio` (pick agents with `-a`, for your user with `-g`).
- **Codex** (skills and the kit):
  `codex plugin marketplace add gabros20/walkthrough-studio && codex plugin add walkthrough-studio@walkthrough-studio`.
  Skills only: `npx skills add gabros20/walkthrough-studio -a codex`.
- **Cursor**: `npx skills add gabros20/walkthrough-studio -a cursor`; the agents can be copied from the kit's
  `agents/` to `~/.cursor/agents/`.
- **Antigravity**: `npx skills add gabros20/walkthrough-studio -a antigravity`.
- **Hermes**: `npx skills add gabros20/walkthrough-studio -a hermes-agent -g`, or per skill
  `hermes skills install gabros20/walkthrough-studio/skills/<skill>`.

**Get the kit tooling.** Every route except a Claude Code or Codex plugin install copies only the `SKILL.md`
files. The skills run the kit's tools, so clone it once (elsewhere? set `WALKTHROUGH_STUDIO_HOME` to its path):

```bash
git clone https://github.com/gabros20/walkthrough-studio ~/walkthrough-studio && cd ~/walkthrough-studio && npm run setup
```

Below, `$KIT` is the kit's folder (the clone, or the plugin cache). Platforms without sub-agents run each
agent's role in the main session; nothing is skipped.

## Quick start

1. **Install** for your agent: the one-liner for your platform is in [Install](#install) above.
2. **Ask your agent.** In a new session, start the lead skill, `walkthrough-film`:

   | Agent | How to invoke |
   |---|---|
   | Claude Code (plugin) | `/walkthrough-studio:walkthrough-film`, or ask in plain words |
   | Codex | `$walkthrough-film` or `/skills`, or ask in plain words |
   | Cursor | `/walkthrough-film`, or ask in plain words |
   | Antigravity | `/walkthrough-film`, or ask in plain words |
   | Hermes | `/walkthrough-film` |
   | Other agents (skills.sh) | check your agent's `/skills` list |

   Then say what you want, for example:

   ```text
   Make a two-minute captioned walkthrough of https://app.example.com. Site mode, my test account is saved as auth.json. Desktop viewport. Hold off on the voiceover for now.
   ```

   The skill confirms the mode and captions or voiceover, runs `walkthrough doctor`, maps the site and asks
   you to approve the plan; then it records, cuts, audits and renders, hands you `review/<name>/index.html`
   for notes, and after picture lock adds the sound and delivers the film to `out/`. Audio is reported
   "measured, not heard": you listen. Which model the lead and each sub-agent run on, per platform:
   [`docs/MODELS.md`](docs/MODELS.md).
3. **What the agent runs.** Every step is one `walkthrough` command, so you can run the same film yourself
   ([`docs/CLI.md`](docs/CLI.md)). `walkthrough` has no npm dependencies, needs Node 22+ and is not installed
   globally: run it as `node $KIT/bin/walkthrough.mjs`, `npm run cli --` inside the kit,
   `npx --prefix $KIT walkthrough`, or through an alias as below. One film from a website:

```bash
# once: the kit, the recorder's Chromium, the CLI on your path
cd ~ && git clone https://github.com/gabros20/walkthrough-studio
npm --prefix ~/walkthrough-studio run setup
export WALKTHROUGH_STUDIO_HOME=~/walkthrough-studio
alias walkthrough='node "$WALKTHROUGH_STUDIO_HOME/bin/walkthrough.mjs"'
# a project folder for the film, then check the machine
walkthrough init my-tour --mode site --url https://example.com
cd my-tour
walkthrough doctor
# map the site, then edit scenes.draft.json into scenes.json
walkthrough explore
# record every scene, then draft the cut from the takes
walkthrough take --auto
walkthrough draft
# the tool briefs, an agent fills captions.answers.json, apply checks it
walkthrough captions brief
walkthrough captions apply
# check the cut, render it, build the review bundle
walkthrough build --dry --audit
walkthrough render
walkthrough review
# picture lock, one music take, its beat grid, the mix
walkthrough state lock
walkthrough sound music --prompt-file music.prompt.txt
walkthrough sound beat-grid music-take1.mp3
walkthrough sound build --deliver out/my-tour.mp4
# the web package: 1080p30 + 720p, poster, .srt + .vtt, YouTube chapters
walkthrough deliver --preset web --video out/my-tour.mp4
```

Each command prints the command it runs (`› …`), so every step can be run by hand too. `state.json` records
takes, captions, builds, renders, reviews, sound, voice, deliveries and costs (`walkthrough state`). The
first real render needs the title and end card creatives (`creatives.json`), or `walkthrough build
--placeholders` for a draft. [`docs/TUTORIAL-first-site-tour.md`](docs/TUTORIAL-first-site-tour.md) walks
through a 60-second captioned tour step by step.

### Commands

| Command | Does |
|---|---|
| `init <dir> [--mode site\|studio] [--url]` | scaffolds a project: recorder config, `scenes.json`, film project, `state.json` |
| `doctor [--capture]` | checks node, ffmpeg, Python, HyperFrames, Chromium, skills, disk, keys and the project; exits 1 on a failure |
| `studio up\|down\|checkpoint\|restore\|status\|tree\|paths` | the studio scripts with the project's studio config |
| `explore [url]` | tour map of a site: pages, controls, thumbnails, `scenes.draft.json` (read-only crawl) |
| `capture-test`, `take [scene…] [--auto] [--parallel N]` | the recorder's capture test and take runner |
| `draft` | first-pass storyboard from the accepted takes |
| `captions brief\|apply` | the caption brief for an agent, then its answers checked and written into the storyboard |
| `build [--dry] [--audit] [--no-captions]`, `audit` | the film build (aspect, pointer treatments, `--fit-audio`) and its audit |
| `render [--name] [--no-captions]` | the HyperFrames render, with the disk policy (5 GB, `buffer` spill, `caffeinate`) |
| `review [--render <name>]` | the review bundle and static review page for a render |
| `sound music\|beat-grid\|build` | one music take by API key, its beat grid, the soundtrack and the `delivered:` mux |
| `vo tts\|assemble\|lexicon\|translate\|listen-check\|…` | the voiceover tools: per-line TTS with a cache, lexicon, language twins, listening proxy, fit check, placement |
| `deliver --preset sales\|web\|social\|docs` | the delivery presets |
| `state [lock\|unlock]`, `cost add\|show` | the project state and the cost ledger |

Every command, flag, file it writes, the state schema and the exit codes: [`docs/CLI.md`](docs/CLI.md).

## Without the CLI (site mode by hand)

The same film with the tools called directly, with `P` = a project folder outside the kit:

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
a voiceover needs holds sized for speech, a script, paid TTS (per line with a cache, or one take) and a ducked
mix. Both can come from one picture lock (`build.mjs --no-captions` gives the captionless twin with identical
timing). Picture-first is the default; for a tutorial whose narration leads, the voice is placed first and
`build.mjs --fit-audio` holds the picture until every line fits. The `walkthrough-film` skill walks through
these decisions.

## Pipeline

```
 plan ─> studio | site login ─> capture test ─> rehearse ─> takes (CP0..CPn) ─> rough cut ─> captions/title/end
                                               ^   │                                 │
                               app fixes ──────┘   └─ retake from a checkpoint       v
 delivery <─ review <─ voiceover twin <─ sound <─ picture lock <─ review loop (describers, critic, holds)
```

| Folder | What it does | Reference |
|---|---|---|
| `bin/`, `cli/` | the `walkthrough` CLI: one file per command, project resolution, `state.json`, cost ledger, disk policy, `doctor` | [`docs/CLI.md`](docs/CLI.md) |
| `studio/` | sandboxed app instance: APFS clone, own data, separate ports, production build, checkpoints | [`studio/README.md`](studio/README.md) |
| `recorder/` | Playwright new-headless with GPU, desktop (1440x810 @2x) or phone (390x844 @3x), CDP screencast at 60 fps, invisible mouse on arcs, `events.json`, site-mode steps, `waitQuiet`, safe-area scrolling, tour map, new tabs, downloads and dialogs, parallel takes | [`recorder/README.md`](recorder/README.md), [`docs/CONTRACT.md`](docs/CONTRACT.md) |
| `film/` | storyboard drafted from takes, caption drafting, `build.mjs` → HyperFrames compositions, one source→film mapping, pointer bridging, aspect presets and phone bezel, `--fit-audio`, `--audit`, `--no-captions` twin, review bundle | [`film/README.md`](film/README.md), [`docs/STORYBOARD.md`](docs/STORYBOARD.md), [`docs/LOOK.md`](docs/LOOK.md), [`docs/CAPTIONS.md`](docs/CAPTIONS.md), [`docs/REVIEW.md`](docs/REVIEW.md) |
| `sound/` | music by API key, beat grid, music bed fitted by bar-aligned loops, clicks, whooshes, riser, −16 LUFS, ducking, the `delivered:` guard | [`sound/README.md`](sound/README.md) |
| `voiceover/` | script fitted to EDL windows, per-line TTS with a cache or one take, lexicon, language twins, placement, re-timing fit check, listening proxy | [`voiceover/README.md`](voiceover/README.md), [`docs/VOICE.md`](docs/VOICE.md) |
| `delivery/` | presets (`sales`, `web`, `social`, `docs`), masters and web encodes, clips, GIFs, cropped stills, showcase sheets, README md/html/pdf, verify, zip | [`delivery/README.md`](delivery/README.md), [`docs/DELIVERY.md`](docs/DELIVERY.md) |
| `test/` | the golden test of the film build (`npm test`) | [`CLAUDE.md`](CLAUDE.md) |
| `skills/`, `agents/`, `.claude-plugin/` | 7 skills, 9 agent definitions, the plugin manifest | below |
| `examples/brightpost/` | the first real project, anonymised | [its README](examples/brightpost/README.md) |

How the stages fit together and the numbers that worked: [`docs/PIPELINE.md`](docs/PIPELINE.md). What went
wrong the first time and the fix for each: [`docs/LESSONS.md`](docs/LESSONS.md).

## Skills and agents

| Skill | Use it to |
|---|---|
| `walkthrough-film` | run the whole job as the lead with the CLI: steps, gates, which agent and model for what, guardrails |
| `record-takes` | studio, tour map, capture test, adapter, rehearsals, takes with checkpoints or in parallel, INDEX.md |
| `build-film` | storyboard, captions, aspect, pointer at cuts, build, drafts, audit, script-first timing, picture lock, captionless twin |
| `review-film` | review bundle and page, Haiku describers + Opus critic + rulings loop |
| `film-sound` | one music generation, beat grid, bed extension, effects, mix, verified delivery |
| `voiceover` | script fitted to windows or voice-first, per-line TTS with a cache, lexicon, languages, placement, listening proxy |
| `deliver-package` | the presets and the sales package: films, clips, stills, showcase, copy, README, verify, zip |

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
On Codex, Antigravity, Cursor or Hermes, [`docs/MODELS.md`](docs/MODELS.md) gives the equivalent model for each
tier and how to set it there.

## Documentation

[`docs/README.md`](docs/README.md) lists every doc by purpose (tutorial, how-to, reference, explanation),
including the architecture decision records in [`docs/adr/`](docs/adr/) and the
[changelog](docs/CHANGELOG.md). What is still open (a guided login recorder, time-lapse auto-detection,
themes, music fallbacks, hosting the review page) is in [`docs/ROADMAP.md`](docs/ROADMAP.md). Rules for agents
working in this repo: [`CLAUDE.md`](CLAUDE.md).

## Contributing, versioning, licence

- **Contributing**: [`CONTRIBUTING.md`](CONTRIBUTING.md) covers the checks (`npm run check`, `npm test`,
  `npm run check:site`), adding a skill, agent or tool, conventional commits and pull requests. Be kind:
  [code of conduct](CODE_OF_CONDUCT.md). Security problems: [`SECURITY.md`](SECURITY.md) (private reporting,
  not issues).
- **Versioning**: [semver](https://semver.org/), one version across the plugin and package manifests, set by
  `scripts/version.mjs`; changes are listed in the [changelog](docs/CHANGELOG.md) and each `v*` tag becomes a
  GitHub Release. Release procedure: [`docs/MAINTAINERS.md`](docs/MAINTAINERS.md).
- **Licence**: the code is [MIT](LICENSE). Music and voice generated through ElevenLabs are governed by the
  terms of the plan they were generated under (the free tier's terms for commercial use were not verified
  for the first film); confirm them before publishing. Brand assets, logos and app footage belong to their
  owners and are not in this repo: the example's `brand.json` points at the client's files through an
  environment variable.
