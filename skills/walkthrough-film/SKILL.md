---
name: walkthrough-film
description: Master workflow for making a Screen-Studio-style walkthrough or tour video of any web app or website with agents, with on-screen captions or an ElevenLabs voiceover (or both twins from one picture lock), driven by the `walkthrough` CLI. Two entry modes - studio mode for an app you own (isolated clone, own data, checkpoints) and site mode for any URL (no studio; saved login, consent-banner dismissal, generic waits). Covers plan, tour map, capture test, scripted takes with an invisible mouse and action log, HyperFrames edit with a drawn pointer, camera punch-ins and event-anchored captions, 16:9, 9:16 or 1:1 films, review bundle and loop, picture lock, music and SFX, voiceover (picture-first or voice-first), and delivery presets; which specialised agent and model tier does each step; the review gates and honesty rules. Use when asked for an app walkthrough, product tour, feature demo, onboarding video, stakeholder or client presentation video of an app or site, or to remake/extend one made with this kit.
---

# Walkthrough film

You are the lead. On a large job you orchestrate and review; specialised agents do the work. You spend your
own tokens on the plan, on rulings, on reading the critic's findings and on final checks.

**Where the kit is.** `KIT` is the walkthrough-studio checkout; kit paths (`recorder/`, `film/`, `docs/`,
`agents/`, ...) are relative to it. Use the first of these that holds `recorder/` and `film/`:
`${CLAUDE_PLUGIN_ROOT}` (Claude Code or Codex plugin install; skip it if it shows unexpanded),
`$WALKTHROUGH_STUDIO_HOME`, `~/walkthrough-studio`, this skill's own `../..`. If none does, the install copied
only this file (skills.sh): ask the user to run
`git clone https://github.com/gabros20/walkthrough-studio ~/walkthrough-studio && cd ~/walkthrough-studio && npm run setup`.
Without sub-agents (most platforms other than Claude Code), do each named agent's role yourself from
`$KIT/agents/<name>.md`.

One film is one **project folder** outside the kit (recorder config, scenes, takes, brand, storyboard,
voiceover, renders, `state.json`); the kit is never written to. Run `npm run setup` in `$KIT` once
(Playwright Chromium for the recorder and the PDF step).

Docs (read the ones your step needs, not all): `docs/CLI.md` (every command, what it writes, the state
file), `docs/PIPELINE.md` (the pipeline and its numbers), `docs/LESSONS.md` (read once before planning),
`docs/CONTRACT.md`, `docs/CAPTURE_TEST.md`, `docs/STORYBOARD.md`, `docs/LOOK.md`, `docs/CAPTIONS.md`,
`docs/REVIEW.md`, `docs/VOICE.md`, `docs/DELIVERY.md`, `docs/ROADMAP.md` (what is open).
Worked example (studio mode, both twins): `examples/brightpost/` (`PLAN.md`, configs, storyboard,
voiceover, delivery; agent roles in `agents/*.md`).

## The CLI flow (default)

`walkthrough` (`node $KIT/bin/walkthrough.mjs`; alias it) wraps every tool, finds the project from the
current folder (or `--project <dir>`), prints the exact command it runs (`› …`) and records takes, captions,
builds, renders, reviews, sound, voice, deliveries and costs in the project's `state.json`, so a new session
resumes with `walkthrough state`. The order of one film:

```bash
walkthrough init <dir> --mode site|studio --url <baseUrl>   # project scaffold; cd into it
walkthrough doctor [--capture]                    # tools, skills, disk, keys, config; fix every fail
walkthrough studio up | checkpoint CP0            # studio mode only
walkthrough explore [url]                         # tour map + scenes.draft.json -> edit into scenes.json
walkthrough take --auto                           # or go files; --parallel N in site mode
walkthrough draft                                 # storyboard.json from the accepted takes
walkthrough captions brief / captions apply       # the tool briefs, an agent writes captions.answers.json
walkthrough build --dry --audit                   # durations, pointer treatments, audit; repeat to clean
walkthrough render [--name final]                 # disk policy, sidecars copied, state.renders
walkthrough review                                # review/<name>/: sheets, cut strips, audit, REVIEW.md, index.html
walkthrough state lock                            # picture lock
walkthrough sound music | beat-grid | build --deliver out/<film>.mp4
walkthrough vo tts | assemble | listen-check …     # voiceover twin
walkthrough deliver --preset sales|web|social|docs --video out/<film>.mp4
walkthrough clean --dry                           # report the table; clean --all --yes once accepted
```

The by-hand commands in each step skill are the fallback (no CLI, a flag the CLI does not pass, or
debugging): they are what the `›` lines print. Choices that change the plan:

- **Aspect**: `look.aspect` `"16:9"` (default), `"9:16"` or `"1:1"` in `brand.json` or the storyboard's
  `look` (or `build --aspect`). 9:16 needs takes recorded with `viewport: "phone"`; a phone take gets a
  neutral device bezel (`look.bezel: false` turns it off). Numbers: `docs/LOOK.md` "Aspect presets".
- **Pointer at cuts**: the build bridges or fades jumps by itself (`"pointerAtCuts": "auto"`); set
  `bridge`, `fade` or `none`, or per cut `"pointer"` on an exit, only to overrule it.
- **Voice-first**: picture-first is the default. When the narration leads (tutorials), place the voice
  first and build with `--fit-audio voiceover/placement.json` (or `"fitAudio"` in the storyboard): the
  film holds rest moments until each line fits (`docs/STORYBOARD.md` "Script-first timing").
- **Outputs**: delivery presets `sales` (the full package), `web` (encodes, poster, VTT, chapters),
  `social` (clips under 60 s, captions burned, a 9:16 render when there is one), `docs` (10-30 s clips and
  GIFs per feature). Scene `"group"`s in the storyboard decide the features.

## Prerequisite skills

The film build depends on the HyperFrames skills `/hyperframes` (render contract, work loop), `/media-use`
(audio, SFX, transcription) and `/hyperframes-cli`. If they are not installed, tell the user to run
`npx hyperframes skills update` (it installs the core set) and start a new session. Never install them
yourself. Until then, `film/CLAUDE.md` and `docs/LOOK.md` carry the render-contract basics, and rendering
with `npx --yes hyperframes@0.9.16 render` still works.

## First decisions (ask the owner if unclear; they change the plan)

### 1. Entry mode

| | Studio mode | Site mode |
|---|---|---|
| When | you own the app's code and can run it locally | any URL: production, staging, a third-party site, a docs site |
| Instance | `studio/`: APFS clone of the working tree, its own data, separate ports, production build, telemetry off | none: the recorder opens the URL directly |
| Login | demo account + one-time link created in the studio, checkpoint CP0 | a test account logged in once outside the take; the saved Playwright `storageState` is reused by every take |
| Clean frame | production build hides dev badges | consent/cookie banners dismissed from the config's dismiss list before the sync flashes |
| Waiting | app-specific turn detection in the adapter (e.g. a request finishing + the submit button returning) | generic `waitQuiet` (network idle and no DOM mutations for a settle window) |
| Undo | restore a checkpoint and redo the take | no checkpoints: record idempotent scenes (read-only tours, or actions that can be repeated), or reset state by hand between takes |
| App fixes | `app-fixer` fixes what the film exposes, then retake | report issues to the owner; never change a site you do not own |

Both modes use the same recorder, take format (`walkthrough-take/1`), film kit, sound, voiceover and delivery.
Pick the viewport preset early (`viewport: "desktop"` = 1440x810 @2, the default; `"phone"` = 390x844 @3 with
mobile emulation): it fixes the capture size, the film's framing and which aspects are possible (a 9:16 film
needs phone takes). Use `scrollIntoViewSafe` for every target near a viewport edge, and
`mark` the elements captions talk about (marks carry the element's visible text, which the caption audit
checks against). Exact config keys: `recorder/` docs and `docs/CONTRACT.md`.

### 2. Captions or voiceover (decide before the storyboard)

| | Captions twin | Voiceover twin |
|---|---|---|
| Carries the message | short on-screen lines (≤ 10 words) | a narrator; no captions on screen |
| Pacing | holds sized for reading: ≥ 0.5 s + 0.3 s per word, last line ≥ 2.5 s | holds sized for speech: 2.4 words/s + 0.35 s per line, 15% spare, pauses at reveals |
| Plays muted | yes (decks, autoplay on web pages) | no |
| Build | `build.mjs` normally | the same storyboard with `--no-captions`: identical picture timing |
| Extra steps | none | script, TTS (one take, or per line with a cache), placement, ducked mix |
| Voice-first | n/a | lines placed back to back, then `build --fit-audio` makes room for them |

If the owner wants both (the first film shipped both and let the client choose): size each hold for the
slower of the two at that moment, lock the picture once, render the captioned film and the `--no-captions`
twin from the same lock, and fit the voiceover to the twin's EDL windows. Any later re-timing goes dry run →
voiceover fit check → render both once.

## Guardrails (apply to you and every agent you brief; copy them into briefs)

- Never print secret values: names only. Never store secrets, `.env` contents, saved login state or one-time
  links in project memory, docs or git (`storageState` files and `link.txt` stay git-ignored).
- Studio mode: never stop or restart the owner's own dev servers; never write into the app repo's `data/`.
  The studio instance is the only thing the pipeline may start, stop, checkpoint or restore.
- Site mode: use a test account; do not submit anything that creates real orders, payments, messages to real
  people or public posts; respect the site's terms; one recording pass at a time.
- Footage, renders, audio and packages stay out of git. Commit messages end with the session line the host
  provides. Push large packs with `git -c http.postBuffer=524288000 push`; never force-push.
- Honesty: waits are labelled time-lapses; nothing is mocked or redrawn; a caption or spoken line is cut if its
  claim is not visibly true in the take; fictional companies and generated media are disclosed in the package.
- Sound must be verified present on every delivered file (`delivered:` line plus `delivery/verify.py`). Audio
  is reported as "measured, not heard"; listening checks are handed to a human.
- Paid generations (music, speech, real agent turns in the app) are budgeted, never retried in the same turn
  after "busy", and never repeated to "try again".
- Use `/bin/rm` and `/usr/bin/zip` by absolute path (shell aliases broke them).
- Clean up after yourself: temporary folders never outlive the step that made them. Never leave checkpoints,
  raw frames, frame caches or spilled work files on the owner's disk after the job (`walkthrough clean`).

## Agents and model tiers

| Step | Agent (`agents/`) | Model | Spawn |
|---|---|---|---|
| Feature map, code or site reading | built-in `Explore` | default | 2-3 in parallel, read-only |
| Plan stress test | built-in `Plan` | default | once, before approval |
| Studio instance, re-sync (studio mode) | `studio-builder` | sonnet | once; again when the app changes |
| Recorder, capture test, takes, retakes | `take-operator` | opus | one, long-lived |
| Draft storyboard, cuts, audit, renders | `film-editor` | opus | one, long-lived |
| Frame read-back ("what is on screen at 1:03?") | `frame-describer` | haiku | 3 in parallel on disjoint ranges |
| Independent review, verify describers | `film-critic` | opus | per draft that matters |
| App issues found in review (studio mode) | `app-fixer` | opus | when the owner or critic finds app bugs |
| Music bed, SFX, mix, delivery mux | `sound-designer` | opus | after picture lock |
| Voiceover script and placement | `voiceover-producer` | opus | for the voiceover twin |
| Masters, clips, stills | `delivery-packager` media mode | sonnet | at delivery |
| Showcase, copy, README | `delivery-packager` copy mode | opus | at delivery, in parallel |

The tiers are Claude names. On Codex, Antigravity, Cursor or Hermes use the equivalents in
`docs/MODELS.md` (large / medium / small, with each platform's model and effort setting); the rule
is the same: spend by task, and one large-model review of the small models' work.

Rules: the cheapest model that can do a step reliably; an Opus critic checks the small models' output; critical
reviews are never skipped. Name each agent so you can message it later. Brief each like a peer: goal, paths,
what to read first, hard rules, what to build, checks before reporting, report format. Ask for long reports as
a scratchpad file plus a short message. Tell worker agents not to spawn sub-agents. Without sub-agents
(platforms other than Claude Code), do each row's role checklist yourself, in order: see `agents/<name>.md` in
the kit; the built-in `Explore` and `Plan` rows become your own read-only survey and a self-review of the plan.

## Workflow

- [ ] **0. Preflight.** `walkthrough init <dir>` then `walkthrough doctor` (Node 22+, ffmpeg with libx264
  and drawtext, Python 3 with numpy and Pillow, `npx hyperframes@0.9.16`, Playwright Chromium, the
  `/hyperframes`, `/media-use` and `/hyperframes-cli` skills (see "Prerequisite skills"), free disk and the
  `buffer`, `ELEVENLABS_API_KEY` by name only, the project config). Renders need 3-8 GB of frame cache; set
  `buffer` in `walkthrough.config.mjs` to an external drive when the disk is short (the CLI spills to it).
  Studio mode: note the owner's dev-server ports.
- [ ] **1. Decide** mode, viewport preset, aspect, captions / voiceover / both (and picture-first or
  voice-first), target length (3:00-3:15 worked; take the owner's number when given), the delivery presets.
  Defaults when the owner does not say: site mode for a URL you do not run, `desktop`, 16:9, captions only
  (voiceover when they ask for a voice), picture-first, the kit's neutral brand when no brand files exist,
  `sales` for a client package.
- [ ] **2. Plan.** Explore agents map features, selectors, limits and blockers (site mode:
  `walkthrough explore` for the tour map, `tour-map.md` and `scenes.draft.json`, and
  `node recorder/tools/inspect.mjs --config <config> --path /page` for one page, read-only). Write the plan: story table with
  film times and caption or narration drafts, look numbers, pointer/camera/caption rules, takes, sound,
  verification, risks, order, cost. Plan agent stress-tests it. **Gate: owner approves.**
- [ ] **3. Instance.** Studio mode: `studio-builder` builds it and CP0 (`walkthrough studio up`, `studio
  checkpoint CP0`). Site mode: edit the scaffold's `walkthrough.config.mjs` and turn `scenes.draft.json`
  into `scenes.json`, log in once with the test account if the site needs one
  (`recorder/tools/save-login.mjs`), list the banners to dismiss, confirm the URL loads clean (`inspect.mjs`).
- [ ] **4. Capture test.** `take-operator` runs it; **gate: you accept the method and frame rate** (60 fps only
  if it holds honestly, else 30 throughout). Meanwhile `film-editor` prepares brand assets and components.
- [ ] **5. Rehearse** every step that can surprise (agent turns, slow loads, menus that need scrolling); adjust
  the plan to what the app or site actually does.
- [ ] **6. Takes** (skill `record-takes`). While recording nothing heavy runs (editor: code and `--dry` only).
  Studio mode: if the app changes, stop, re-sync, rebuild, re-record. **Gate: truth checks in INDEX.md pass.**
- [ ] **7. Edit** (skill `build-film`): `walkthrough draft` → refine → `captions brief` / agent / `captions
  apply` → `build --dry --audit` → `render`.
- [ ] **8. Review loop** (skill `review-film`): `walkthrough review` (the bundle), describers on its sheets,
  critic on the bundle, your numbered rulings, editor fixes. Repeat until the must-fix list is empty. App
  bugs (studio mode) go to `app-fixer`, then a retake. Send the owner `review/<name>/index.html` for notes.
- [ ] **9. Picture lock.** `build --audit` clean, `hyperframes check` clean, durations in range;
  `walkthrough state lock`. Render the captioned film and, if wanted, the `--no-captions` twin (and a 9:16
  version for social) from the same lock. Show the owner a preview.
- [ ] **10. Music** (skill `film-sound`, `docs/ELEVENLABS.md`): you generate the bed once (`walkthrough sound
  music` with a key, else the connector; film length + 2 s); `sound-designer` measures the grid and builds
  bed, SFX and mix; **gate: `delivered:` line** for each twin.
- [ ] **11. Voiceover** (skill `voiceover`), if chosen: script → TTS (`walkthrough vo tts`, cached per line,
  or one take) → placement → ducked mix → `vo listen-check` (measured, not heard).
- [ ] **12. Owner review.** Fix notes: retake (from the right checkpoint in studio mode), re-frame, dry run,
  voiceover fit check, re-render the twins once, re-run sound.
- [ ] **13. Delivery** (skill `deliver-package`): `walkthrough deliver --preset …` per output; for `sales`,
  two packager agents in parallel; you review the hero sheet, a few stills, the README; verify; zip.
- [ ] **14. Hand over.** Paths, durations, loudness numbers, known flaws with times, listening checks for a
  human, the open licence check for generated media, what is not in git.
- [ ] **15. Clean up (required).** After delivery run `walkthrough clean --dry`, report the table to the
  owner (logical vs on-disk size, what goes, what stays), and run `walkthrough clean --all --yes` once they
  accept the film (`walkthrough deliver` prints the exact line). Never leave checkpoints, raw frames or
  caches behind. Earlier, `walkthrough clean --yes` after picture lock is fine; it keeps the newest and the
  current checkpoint.

## Scheduling rules learned the hard way

- One agent owns the instance at a time. Tell everyone else in writing not to restart it during takes.
- Renders run in the foreground of the agent that started them; an agent that backgrounds a render and goes
  idle does not come back.
- When picture timing changes after the voiceover exists: dry run → VO fit check → render once.
- Before claiming anything is done, run its check (capture checks, `build.mjs --audit`, `hyperframes check`,
  `delivered:`, `delivery/verify.py`) and read the output.
- `walkthrough render` takes the build flags (`--aspect`, `--fit-audio`, `--fit-gap`, `--fit-max`, `--brand`,
  `--takes`) and rebuilds when the build on disk differs from them, printing each input that changed. Give
  `render` the flags you built with, or keep `look.aspect` and `fitAudio` in the storyboard.
