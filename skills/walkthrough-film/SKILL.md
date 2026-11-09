---
name: walkthrough-film
description: Master workflow for making a Screen-Studio-style walkthrough or tour video of any web app or website with agents, with on-screen captions or an ElevenLabs voiceover (or both twins from one picture lock). Two entry modes - studio mode for an app you own (isolated clone, own data, checkpoints) and site mode for any URL (no studio; saved login, consent-banner dismissal, generic waits). Covers plan, capture test, scripted takes with an invisible mouse and action log, HyperFrames edit with a drawn pointer, camera punch-ins and event-anchored captions, review loop, picture lock, music and SFX, voiceover, and a delivery package; which specialised agent and model tier does each step; the review gates and honesty rules. Use when asked for an app walkthrough, product tour, feature demo, onboarding video, stakeholder or client presentation video of an app or site, or to remake/extend one made with this kit.
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

Run kit commands from `$KIT` (or with absolute paths). Keep the project's own files (walkthrough config,
scenes, takes, brand, storyboard, voiceover, package config) in the user's project and pass them with
`--config`, `--takes`, `--brand` and file arguments. Run `npm run setup` in `$KIT` once (Playwright Chromium
for the recorder and the PDF step).

Docs (read the ones your step needs, not all): `docs/PIPELINE.md` (the pipeline and its numbers),
`docs/LESSONS.md` (read once before planning), `docs/CONTRACT.md`, `docs/CAPTURE_TEST.md`,
`docs/STORYBOARD.md`, `docs/LOOK.md`, `docs/DELIVERY.md`, `docs/ROADMAP.md` (what is planned, not built).
Worked example (studio mode, both twins): `examples/brightpost/` (`PLAN.md`, configs, storyboard,
voiceover, delivery; agent roles in `agents/*.md`).

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
mobile emulation): it fixes the
capture size and the film's framing. Use `scrollIntoViewSafe` for every target near a viewport edge, and
`mark` the elements captions talk about (marks carry the element's visible text, which the caption audit
checks against). Exact config keys: `recorder/` docs and `docs/CONTRACT.md`.

### 2. Captions or voiceover (decide before the storyboard)

| | Captions twin | Voiceover twin |
|---|---|---|
| Carries the message | short on-screen lines (≤ 10 words) | a narrator; no captions on screen |
| Pacing | holds sized for reading: ≥ 0.5 s + 0.3 s per word, last line ≥ 2.5 s | holds sized for speech: 2.4 words/s + 0.35 s per line, 15% spare, pauses at reveals |
| Plays muted | yes (decks, autoplay on web pages) | no |
| Build | `build.mjs` normally | the same storyboard with `--no-captions`: identical picture timing |
| Extra steps | none | script, one paid TTS take, placement, ducked mix |

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

Rules: the cheapest model that can do a step reliably; an Opus critic checks the small models' output; critical
reviews are never skipped. Name each agent so you can message it later. Brief each like a peer: goal, paths,
what to read first, hard rules, what to build, checks before reporting, report format. Ask for long reports as
a scratchpad file plus a short message. Tell worker agents not to spawn sub-agents. Without sub-agents
(platforms other than Claude Code), do each row's role checklist yourself, in order: see `agents/<name>.md` in
the kit; the built-in `Explore` and `Plan` rows become your own read-only survey and a self-review of the plan.

## Workflow

- [ ] **0. Preflight.** Free disk (renders need 3-8 GB of frame cache; if a step would leave < 5 GB, use an
  external buffer for render caches only). Node 24, ffmpeg 8, Python 3 with numpy and Pillow, `npm run setup`
  (Playwright Chromium), `npx hyperframes@0.9.16`, the `/hyperframes`, `/media-use` and `/hyperframes-cli`
  skills (see "Prerequisite skills"), ElevenLabs
  connector or key (names only). Studio mode: note the owner's dev-server ports.
- [ ] **1. Decide** mode, viewport preset, captions / voiceover / both, target length (3:00-3:15 worked; take
  the owner's number when given). Defaults when the owner does not say: site mode for a URL you do not run,
  `desktop`, captions only (voiceover when they ask for a voice), the kit's neutral brand when no brand files
  exist.
- [ ] **2. Plan.** Explore agents map features, selectors, limits and blockers (site mode:
  `node recorder/tools/inspect.mjs --config <config> --path /page` and `recorder/tools/explore.mjs` for
  screens, controls and boxes, read-only). Write the plan: story table with
  film times and caption or narration drafts, look numbers, pointer/camera/caption rules, takes, sound,
  verification, risks, order, cost. Plan agent stress-tests it. **Gate: owner approves.**
- [ ] **3. Instance.** Studio mode: `studio-builder` builds it and CP0. Site mode: copy `recorder/site-test/`'s config
  and `scenes.json` into the project, log in once with the test account if the site needs one
  (`recorder/tools/save-login.mjs`), list the banners to dismiss, confirm the URL loads clean (`inspect.mjs`).
- [ ] **4. Capture test.** `take-operator` runs it; **gate: you accept the method and frame rate** (60 fps only
  if it holds honestly, else 30 throughout). Meanwhile `film-editor` prepares brand assets and components.
- [ ] **5. Rehearse** every step that can surprise (agent turns, slow loads, menus that need scrolling); adjust
  the plan to what the app or site actually does.
- [ ] **6. Takes** (skill `record-takes`). While recording nothing heavy runs (editor: code and `--dry` only).
  Studio mode: if the app changes, stop, re-sync, rebuild, re-record. **Gate: truth checks in INDEX.md pass.**
- [ ] **7. Edit** (skill `build-film`): draft storyboard from `events.json` → refine → build → render → audit.
- [ ] **8. Review loop** (skill `review-film`): audit, describers, critic, your numbered rulings, editor fixes.
  Repeat until the must-fix list is empty. App bugs (studio mode) go to `app-fixer`, then a retake.
- [ ] **9. Picture lock.** `build.mjs --audit` clean, `hyperframes check` clean, durations in range. Render
  the captioned film and, if wanted, the `--no-captions` twin from the same lock. Show the owner a preview.
- [ ] **10. Music** (skill `film-sound`, `docs/ELEVENLABS.md`): you generate the bed (one call; film length + 2 s); `sound-designer`
  builds bed, SFX and mix; **gate: `delivered:` line** for each twin.
- [ ] **11. Voiceover** (skill `voiceover`), if chosen: script → one TTS take → placement → ducked mix.
- [ ] **12. Owner review.** Fix notes: retake (from the right checkpoint in studio mode), re-frame, dry run,
  voiceover fit check, re-render the twins once, re-run sound.
- [ ] **13. Delivery** (skill `deliver-package`): two packager agents in parallel; you review the hero sheet,
  a few stills, the README; verify; zip.
- [ ] **14. Hand over.** Paths, durations, loudness numbers, known flaws with times, listening checks for a
  human, the open licence check for generated media, what is not in git.

## Scheduling rules learned the hard way

- One agent owns the instance at a time. Tell everyone else in writing not to restart it during takes.
- Renders run in the foreground of the agent that started them; an agent that backgrounds a render and goes
  idle does not come back.
- When picture timing changes after the voiceover exists: dry run → VO fit check → render once.
- Before claiming anything is done, run its check (capture checks, `build.mjs --audit`, `hyperframes check`,
  `delivered:`, `delivery/verify.py`) and read the output.
