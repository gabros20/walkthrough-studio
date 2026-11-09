# Pipeline

*Mode: explanation. The shape of a job and the numbers that worked. Exact commands live in the skills and the folder READMEs; the reasons behind the big choices are in [`adr/`](adr/).*

Each by-hand step below has a `walkthrough` command beside it (marked **CLI**, from [`CLI.md`](CLI.md)).
The CLI prints the by-hand command it runs (the `›` line), records the step in `state.json` and adds the
checks between steps; the by-hand commands stay the fallback.

How a walkthrough film is made with this kit, start to finish, with the numbers that worked. The worked
example is `examples/brightpost/PLAN.md` (the approved plan of the first film); this page is its
generic part. Interfaces between stages are in `docs/CONTRACT.md` (takes), `docs/STORYBOARD.md` (edit),
`docs/LOOK.md` (look and motion) and `docs/DELIVERY.md` (package).

```
 plan ──> studio ──> capture test ──> rehearse ──> takes (CP0..CPn) ──> rough cut ──> captions/title/end
                                                     ^   |                                  |
                                     app fixes ──────┘   └── retake from a checkpoint       v
 delivery <── review <── voiceover twin <── sound <── picture lock <── review loop (frames, critic, holds)
```

## Modes and voices

- **Studio mode** (an owned app): sections 1-4 below as written.
- **Site mode** (any URL): no studio (skip section 1). Log in once with a test account and reuse the saved
  `storageState`; dismiss consent banners from a list before the sync flashes; wait with `waitQuiet`
  (network idle + no DOM mutations) instead of app-specific turn detection; no checkpoints, so scenes are
  idempotent or reset by hand. Everything from the capture test on is the same.
- **Captions or voiceover** is decided at planning: it sets hold lengths (reading vs speech time) and whether
  the `--no-captions` twin, a script, a TTS take and ducking are needed. Both twins come from one picture lock.

## 0. Plan (lead, with Explore/Plan agents)

- Map the app's features and selectors, the existing video tooling, and anything that can block a session
  (usage limits, one-time links, signed URLs that expire, rate limits). Three parallel read-only Explore agents
  did this in about 10 minutes; a Plan agent then stress-tested the design.
- Write the plan before anything runs: story table (scene, film time, what is on screen, caption draft),
  look and motion numbers, pointer, camera, captions, studio, takes and checkpoints, sound, verification,
  risks and fallbacks, order of work, cost estimate. Get the owner's approval.
- One storyline, one user, one task carried through every feature. Target length 3:00-3:15.
- Every number in a caption comes from the code or the recording.

## 1. Studio instance (`studio/`)

The app runs from a disposable copy so the owner's dev setup is never touched.

- APFS clone of the working tree (`cp -cR`, near-zero space); delete its `data/`, `.git`, build output.
- Its own database copy. If the dev server holds the DB open, copy twice and compare until two consecutive
  copies match; confirm the studio process can never resolve the owner's DB path.
- Separate ports (e.g. web :3011, core :8797), telemetry off, background job loops slowed, demo usage limits
  raised so rehearsals cannot lock the UI, internal-only UI hidden.
- Production build of the web app (no dev badges, no dev-only controls). Fallback: dev server with dev UI
  suppressed in the clone only.
- Scripts: `up.sh`, `down.sh`, `checkpoint.sh <name>`, `restore.sh <name>`. They only ever kill pids they
  started. A checkpoint = stop the core, clone the DB folder and caches, save browser storage state.
  **CLI**: `walkthrough studio up|down|checkpoint <name>|restore <name>|status`.
- Demo account and assets: a fictional company, its logo (SVG → PNG at the size the app accepts), a one-time
  sign-in link in `link.txt` (never printed), checkpoint CP0 right after issuing it.
- Before every recording session: sync the clone with the repo, rebuild, restart (lesson C2).

## 2. Capture test (`recorder/`, `docs/CAPTURE_TEST.md`)

Measured on a synthetic page with a frame counter, a colour patch and load, then confirmed on the real app.

| Check | Pass |
|---|---|
| Frame size | exactly 2880x1620 (1440x810 CSS px at 2x) |
| Unique frames per second | median ≥ 57 idle, ≥ 50 under load (measured inside animating stretches) |
| Longest gap between frames | ≤ 100 ms |
| Clock drift between sync flashes 5 min apart | ≤ 1 frame |
| Brand colour patch after decode | within ±3 per channel |

Method that passed: full Chromium new-headless with GPU, CDP `Page.startScreencast`, every frame acked at once
and stamped with the browser timestamp, placed into constant-rate 60 fps slots; master H.264 CRF 12, bt709.
If nothing holds 60 honestly, deliver the whole film at 30 fps; never present duplicated frames as 60.
By hand: `node $KIT/recorder/capture-test.mjs new 2 idle 30`. **CLI**: `walkthrough capture-test` (the
same defaults), or `walkthrough doctor --capture` for the short 8 s check.

## 3. Rehearse

On throwaway restores of the checkpoints, try every agent turn the story needs and adjust the storyboard to
what the app actually does: does it ask a clarifying question, does the redesign produce a visibly different
layout, does a translation reach the text on the image, is the memory saved without re-rendering, does the
second request carry the saved rules. Note how long each turn takes.

## 4. Takes (`recorder/` + project adapter and scene scripts)

- One continuous browser session per pass, in story order, on the same content, so nothing changes between
  scenes. Checkpoint after each take whose state later takes depend on; a bad take is rolled back and
  redone, never patched.
- The footage has no cursor. An invisible real mouse follows the same arcs the drawn pointer will follow,
  so hover states match: quadratic arc (control point offset 8% of the distance, perpendicular), duration
  `clamp(0.35 + distance/2400, 0.40, 0.90)` s, ease power3.inOut; arrive 0.18 s before the press.
- Typing has a seeded, slightly irregular cadence. Send with a pointer click (lesson C7).
- Every action is logged to `events.json` (contract `walkthrough-take/1`) on the master clock: move segments
  with control points, down/up, typing ranges with the field's box, scroll, waitStart/waitEnd with outcome,
  nav, cursor style, and `mark` (a named element's box at a moment) for camera targets, spotlights and
  caption anchors. Three sync flashes at each end; a heartbeat pixel.
- `takes/INDEX.md` per pass: each take's labels and times, wait ranges, frame gaps over 100 ms with what is
  on screen, truth checks (does the screen show what the caption will claim), deviations.
- By hand: `node $KIT/recorder/takes/run.mjs --config walkthrough.config.mjs [scenes]`. **CLI**:
  `walkthrough take [scenes] [--auto]` (also records each take and checkpoint in `state.json`).

## 5. Edit (`film/`, `docs/STORYBOARD.md`, `docs/LOOK.md`)

- The kit is read-only during use. Each film has a **project folder** outside the kit
  (`node $KIT/film/scripts/init-project.mjs $P`; **CLI**: `walkthrough init $P`, which adds the recorder
  config, `.gitignore` and `state.json`) holding its inputs (`storyboard.json`, `brand.json`,
  `creatives.json`, `music.json`, `voiceover/`) and receiving every output (build files, `renders/`,
  `sound-build/`, `out/`). Kit commands run from `$P`, or take `--project $P` / `FILM_PROJECT`; without a
  project they fall back to the kit's own `film/` (dev mode). Full command list: skill `build-film`.

- `storyboard.json` is the edit decision list: per scene, kept source ranges as event anchors
  (`"click:send"`), time-lapses (agent waits compressed, labelled "Time-lapse N×", loaders shown at normal
  speed first), slow-downs (no tag), excised stalls, camera framings by element box, spotlights, captions
  anchored to events, transitions.
- One mapping for footage and every overlay: `film = filmIn + (source − srcIn) / rate`, with
  `rate = (srcOut − srcIn) / filmDur`, every bound snapped to a whole frame. Re-cutting never desyncs.
- `$KIT/film/scripts/draft-storyboard.mjs` drafts the first storyboard (`--out $P/storyboard.json`; **CLI**:
  `walkthrough draft`) from `events.json` (clicks → framings and
  caption placeholders, long waits → time-lapses); the editor refines it. `build.mjs --audit` (or `scripts/audit.mjs`)
  reports frozen holds, pointer jumps at cuts, dead air after captions, caption lint and caption claims
  (`"claims": "mark:<label>"`: every quoted phrase must be in that mark's logged text); errors exit 1; it runs before every
  review and before lock. **CLI**: `walkthrough build --audit`, or `walkthrough audit` on the last build.
- `node $KIT/film/build.mjs --takes $T --dry` (from `$P`) prints the durations table without rendering; `--dry-out <dir>` writes the
  would-be `edl.json`, `cues.json`, `captions.srt` for downstream fit checks. **CLI**: `walkthrough build --dry`
  (`--dry-out <dir>` passes through).
- `--no-captions` builds the captionless twin for the voiceover version with identical timing; renders go to
  `$P/renders/final.mp4` and `final-vo.mp4`, each with its `cues.json`, `edl.json`, `captions.srt` copied beside it.
  **CLI**: `walkthrough render --name final`, then `walkthrough render --no-captions --name final-vo` (each
  rebuilds first when the build on disk is not what it asks for, and copies the sidecars).
- HyperFrames 0.9.16 contract: one paused timeline per composition, `fromTo` only, no timers or randomness,
  muted video, bundled fonts.
- Look (details in `docs/LOOK.md`): canvas 1920x1080, flat ink ground, app window 1536x864 at 36 px from
  the top with 16 px radius, a 180 px caption band below; brand typeface, nothing under 28 px; accent colour
  rationed to title wipe, caption tick, payoff, end card; eases by role (arrivals expo.out, camera
  power2.inOut, exits power3.in and 40-50% shorter).
- Pointer: SVG arrow / hand / I-beam chosen from the logged cursor style, 44 px in wide framing; click =
  scale 1 → 0.86 → 1 in 0.18 s plus a disc 28 → 64 px fading from 28%. Spotlight (dim others 35%, 3 px
  outline on the logged box) at most about six times.
- Camera: wide, pane (1.3-1.5x), control (up to 1.85x, the capture's native pixel limit); moves 0.45-0.6 s,
  arrive before the pointer needs the control, hold still while the UI acts; targets from logged boxes only.
- Captions: one line, ≤ 10 words, on a plate in the band; hold ≥ 0.5 s + 0.3 s per word, last line ≥ 2.5 s;
  each anchored to an event; one captions track with hard hides; the same data writes the `.srt`.
- Title and end card bookend the film with the brand lockup built from the real logo files, never redrawn.

## 6. Review loop (`skills/review-film`)

Draft render → Haiku describers read 1 frame every 2 s in parallel ranges → Opus critic verifies their flags
and does its own pass on contact sheets and strips around cuts, camera moves and captions → lead rules on the
critic's list → editor fixes → `build.mjs --audit` → next draft. Two or three rounds were enough.
**CLI**: `walkthrough render --name draft`, then `walkthrough review --render draft` (the review bundle the
describers and the critic read).

## 7. Picture lock, then sound (`sound/`)

**CLI** for the lock: `walkthrough state lock` (records the storyboard's sha256; later builds warn on a change).

- Music is made after picture lock, to the film length plus a 2 s tail (ElevenLabs Music via the connector;
  instrumental; prompt without artist names). If it comes back short, extend by bar-aligned loops.
- Anchor the bed's bar grid to film time 0 and write `beat-grid.json`; the editor nudges scene changes onto
  bars with holds only.
- SFX from HyperFrames' bundled set: a soft click on each real click outside time-lapses, a short whoosh on
  scene-level transitions (two alternating variants), one riser into the end card; each 3-6 dB over the bed.
- Mix: fade in 0.4 s, out 2.5 s under the end card; −16 LUFS integrated, true peak ≤ −1 dBTP. Single mixed
  track muxed onto the picture-only render with ffmpeg; last line `delivered: <path>`.
- `music.json` lives in the project folder (template `$KIT/sound/music.example.json`); from `$P`:
  `node $KIT/sound/build-sound.mjs --video renders/final.mp4 --deliver out/<film>.mp4`
  (`--project $P` from elsewhere; `--film` is an alias). Build files go to `$P/sound-build/`.
  **CLI**: `walkthrough sound music --prompt-file music.prompt.txt`, `walkthrough sound beat-grid`, then
  `walkthrough sound build --video renders/final.mp4 --deliver out/<film>.mp4`.

## 8. Voiceover twin (`voiceover/`)

- Script per scene fitted to EDL windows: estimate 2.4 words/s + 0.35 s per line, 15% spare, start at or
  just after the action, end ≥ 0.5 s before the next line; speaking share about 55-65%; silence at reveals.
- One TTS take of the whole script (ElevenLabs `eleven_v4`, a chosen voice); `hyperframes transcribe` word
  timings → cut lines with short fades → `placement.json`, `vo-track.wav` (48 kHz, film length),
  `voiceover.srt`. **CLI**: `walkthrough vo script lines.json --edl … --cues …`, then
  `walkthrough vo place voiceover/vo-take1.mp3 voiceover/transcript.json --edl … --cues …`; or per line
  (no transcription): `walkthrough vo tts --voice <id>`.
- Picture is the captionless twin; music ducks about 10-12 dB under each line.
- Files live in `$P/voiceover/`; the kit's tools run from `$P` with `--vo-dir voiceover` and
  `--edl/--cues renders/final-vo.*`, then
  `node $KIT/sound/build-sound.mjs --video renders/final-vo.mp4 --voiceover voiceover/vo-track.wav --deliver out/<film>-voiceover.mp4`.
  **CLI**: `walkthrough sound build --video renders/final-vo.mp4 --voiceover voiceover/vo-track.wav --deliver out/<film>-voiceover.mp4`.
  ElevenLabs calls: `docs/ELEVENLABS.md`.

## 9. Delivery (`delivery/`, `docs/DELIVERY.md`)

Renamed masters and web encodes, per-feature clips, cropped stills, creative showcase sheets, written copy,
README in md/html/pdf, a zip, and a verification run. **CLI**: `walkthrough deliver --preset sales` (or `web`,
`social`, `docs`), which runs `delivery/run_preset.py` and then `delivery/verify.py`.

## Model tiers (who does what)

| Work | Model | Agent |
|---|---|---|
| Orchestration, rulings, reading the critic's list, final checks | the main session (most capable model) | — |
| Feature map, code reading before the plan | default (Explore) | built-in Explore ×3 |
| Plan stress test | default (Plan) | built-in Plan |
| Studio instance scripts | Sonnet | `studio-builder` |
| Recorder, capture test, takes | Opus | `take-operator` |
| Film components, storyboard, build, renders | Opus | `film-editor` |
| "What is on screen at 1:03?" frame read-backs | Haiku | `frame-describer` ×3 in parallel |
| Independent review of drafts and of the describers | Opus | `film-critic` |
| Music bed, SFX, mix | Opus | `sound-designer` |
| Voiceover script and placement | Opus (see the agent for why) | `voiceover-producer` |
| App fixes found in review | Opus | `app-fixer` |
| Package: masters, clips, stills | Sonnet | `delivery-packager` (mechanical mode) |
| Package: showcase curation, copy, README | Opus | `delivery-packager` (copy mode) |

Critical reviews are never skipped; everything else spends as few tokens as it can.
