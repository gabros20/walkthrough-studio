# Roadmap: from one film to a recording studio for coding agents

*Mode: explanation. What was planned, what is folded in, and what is still open. Shipped changes are in
[`CHANGELOG.md`](CHANGELOG.md); the design of the 0.2.0 work is [`DESIGN-batch-2.md`](DESIGN-batch-2.md).*

The kit was first built for one film of one app. This file lists what makes it a general
screen-recording studio that an agent can point at any app or website and get a touring or
walkthrough video back, with captions or an ElevenLabs voiceover. Items are grouped by value per
effort. "Folded in" items are built: during the extraction (0.1.0) or in 0.2.0 (both 2026-11-09).
"Partly" says which part is open; "open" is not started. What comes next is at the end.

## 1. Point it at anything

| Item | Why | Status |
|---|---|---|
| **Site mode** (URL + optional storage state, no studio instance) | Most tours are of a running site or a staging URL, not an owned monorepo. | folded in (recorder) |
| **Generic waits** `waitQuiet` (network idle + no DOM mutations) | App-specific turn detection (`POST /api/chat`) does not exist for a site you don't own. | folded in |
| **Declarative scenes** (scenes as a `.json` list of steps: click/type/hover/scroll/reveal/mark/wait/hold/nav/press/park by role+name, text, label, placeholder, testId or selector) | A scene should not need JavaScript for the common case; the agent writes data, the runner interprets it. The JS adapter stays for complex apps (agent turns, uploads). | folded in (`recorder/takes/steps.mjs`, `npm run site-test`) |
| **Tour map / explore step** | Before a storyboard exists, an agent crawls the app with the accessibility tree and records screens, controls and their boxes. The storyboard is then drafted against real labels, not guesses. | folded in (`recorder/tools/explore.mjs`, `walkthrough explore`: same-site breadth-first crawl, one page at a time, robots.txt honoured, never clicks or submits; `tour-map.json`/`.md`, 480 px thumbnails, `scenes.draft.json` with destructive controls listed under `_skipped`). Limits: links only (no client-side state reached by clicks), at most 80 controls per page, single-page apps that route without links map as one page |
| **Auth helpers** | Record a login once (outside the take), save storage state, reuse across takes and sessions. Cookie/consent banners dismissed from a config list before the sync flashes; analytics blocked by URL pattern. | folded in (`storageState`, `dismiss`, `blockUrls`); a guided "record the login" command is open |
| **Viewport presets** desktop / tablet / phone (device emulation) | Mobile tours need a phone frame in the film and a phone viewport in the recorder. | folded in: recorder `viewport: "phone"` (`recorder/config.mjs`); the film draws a neutral phone bezel around a phone take (`film/lib/stage.mjs`, `look.bezel`). No tablet preset: use `{ width, height }` |
| **Multi-tab, downloads, dialogs** | Export flows open new tabs and save files; the recorder should follow the active page and log downloads as events the editor can show. | folded in (`recorder/capture.mjs`, config `popups: same-tab \| follow \| block`, `dialogs: accept \| dismiss`; `download` and `dialog` events, `nav` flags `popup` / `newTab`; covered by `npm run site-test`). Limits: proven on synthetic pages only; headless Chromium draws no dialog box (the film would have to draw one from `message`); `follow` is a hard cut and a page that never paints keeps the old frame |
| **Scroll-safe targets** `scrollIntoViewSafe` | A click target at the viewport bottom cost 70 px of a card in the finished film. | folded in |

## 2. Cut the editing cost

| Item | Why | Status |
|---|---|---|
| **Draft storyboard from events.json** | Every click → camera framing + caption placeholder; every long wait → time-lapse range. The editor refines instead of writing from zero. The biggest token saver in the pipeline. | folded in (`film/scripts/draft-storyboard.mjs`) |
| **Build audit** (`build.mjs --audit` / `scripts/audit.mjs`: frozen holds, pointer jumps at cuts, dead air before cuts, caption lint, caption claims against `mark` text) | These were all found by hand or by the user on the finished film. On the first film's delivered EDL it reports 0 errors and 2 dead-air warnings. | folded in |
| **Caption drafting from labels and marked text** | `mark` events now carry the element's visible text; a Sonnet pass can draft short captions from label + text + scene intent, with the truth check built in. | folded in (`film/scripts/draft-captions.mjs brief` / `apply`, `walkthrough captions`: the tool gathers intent, marks, window and word budget per caption and checks the answers; the agent writes the words; docs/CAPTIONS.md) |
| **Pointer bridging at cuts** | When the pointer would jump more than N px across a cut, emit a short bridging move or hide/show instead of teleporting. | folded in (`pointerAtCuts`, `jump`, per-cut `pointer`: a 0.35 s arc bridge for 120-400 px, a fade beyond; listed in `edl.json` and the audit; docs/STORYBOARD.md "Pointer at cuts") |
| **Time-lapse auto-detection** | Any wait longer than N s in kept footage becomes a labelled time-lapse unless the storyboard says otherwise. | open |
| **Aspect presets** 16:9 / 9:16 / 1:1 | Social cuts and vertical tours. A portrait film needs a portrait capture (the recorder's `phone` preset), plus its own title/end-card and caption layouts. | folded in: `look.aspect` (or `--aspect`, `FILM_ASPECT`) derives the whole layout (`docs/LOOK.md` "Aspect presets"); 9:16 needs a phone take unless `look.allowLetterbox` |
| **Themes** | Light ground, dark ground, brand lockup variants; all in `brand.json`. | partly: colours, font and lockup in `brand.json`; named light/dark themes and lockup variants are open |
| **Golden test** | Sample take + demo storyboard → `build --dry` table and a frame checksum set, run by `npm test`, so changes to `film/lib` cannot silently move the cut. | folded in (`npm test` / CI job `test`: `test/run.mjs` compares edl/cues/captions and composition hashes of a two-scene fixture; `--render` adds eight perceptual frame hashes locally) |

## 3. Sound and voice

| Item | Why | Status |
|---|---|---|
| **Per-line voiceover generation with a cache** | One TTS request per line, keyed by text hash + voice. Re-timing or rewording one line regenerates one line, not the whole track. | folded in (`voiceover/tts.mjs`: cache by voice, model, lexicon and text; assembles onto the windows; connector route without a key; docs/VOICE.md) |
| **Script-first timing mode** | Today picture leads and the VO is fitted. For tutorial-style tours the voice should lead: the film stretches holds to the spoken line durations. Needs the EDL to accept per-range "fit to audio" targets. | folded in (`film/build.mjs --fit-audio voiceover/placement.json`: each line longer than its window gets a frame-exact hold on the longest rest moment in it; refuses with the line, window and shortfall when there is no rest moment of 0.4 s or it needs more than `--fit-max`; `edl.json` `fitAudio`, audit `fit` row; docs/STORYBOARD.md "Script-first timing"). `voiceover/tts.mjs` copies each `script.json` line's `anchor` into `placement.json`, so a voice-first placement needs no hand-added anchors (`place.py` does not) |
| **Multi-language twins** | Captions and VO in other languages from the same picture lock: translate the caption/VO JSON, run TTS, re-place. The app under test spoke 8 languages; the film could too. | folded in (`voiceover/translate-brief.mjs` briefs with per-line limits and claims, `apply` checks the fit; `tts.mjs --lang`) |
| **Pronunciation lexicon** | Brand and product names mispronounced by TTS fixed once per project with spelling hints or phonemes, applied to every line. | folded in (`voiceover/lexicon.json`, spelling hints on the TTS text only; `lexicon.mjs check` lists candidates) |
| **Automatic listening proxy** | Transcribe the final mix with `hyperframes transcribe` and diff it against the script (missing words, wrong words); measure VO/music ratio per line; detect clipping. Still reported as "measured, not heard". | folded in (`voiceover/listen-check.mjs`: per-line WER, voice over music in the mix, clipping runs) |
| **Music fallbacks** | ElevenLabs via API key when no connector is attached; a local library folder; HeyGen catalog. Length-aware prompt; generic beat-grid detection (`sound/analysis/`) to auto-nudge holds to bars. | partly (loop extension, grid; API-key route `sound/generate-music.mjs` and `sound/beat-grid.mjs` folded in; library folder, HeyGen catalog and auto-nudge open) |

## 4. Review that scales

| Item | Why | Status |
|---|---|---|
| **Review bundle** (`review/` folder: contact sheet per scene, cut strips, holds report, pointer-jump report, caption lint, audio report, one `REVIEW.md`) | One command produces everything the critic and the human look at. | folded in (`film/scripts/review-bundle.mjs`, `walkthrough review`; [REVIEW.md](REVIEW.md)) |
| **Fixed critic checklist** | Logo over lettering, cut-off UI, skeletons left visible, dev badges, wrong zoom target, frozen holds, caption truth, pointer teleports, text under 28 px, phone-width legibility. | folded in (`review-film` skill) |
| **Human review page** | Publish the draft (HyperFrames `publish` or an artifact page) with the review bundle so the stakeholder can comment on timestamps. | partly: a static page in the bundle (`review/<name>/index.html`: findings seek the video, notes per finding and per moment, exported as `review-notes.json`); hosting it (HyperFrames `publish` or an artifact page) is open |
| **Describer → critic protocol** | Haiku describes frames factually; Opus judges against the storyboard and LOOK.md. Keep the two apart so the cheap model never grades its own reading. | folded in (agents) |

## 5. Operating it

| Item | Why | Status |
|---|---|---|
| **One CLI** `walkthrough init | doctor | studio up/down/checkpoint/restore | capture-test | take | draft | build | audit | sound | vo | review | deliver` | Today the steps are separate scripts in separate folders with their own flags. | folded in (`bin/walkthrough.mjs`, `cli/commands/`; [CLI.md](CLI.md)): init, doctor, studio, explore, capture-test, take, draft, captions, build, audit, render, review, sound, vo, deliver, state, cost; `npm run check` keeps CLI.md equal to the usage |
| **`doctor`** | Checks ffmpeg (and whether it has `drawtext`), hyperframes version, Chromium, GPU headless fps, disk space on the buffer path, ElevenLabs reachability. Every one of these bit us once. | folded in (`cli/commands/doctor.mjs`, `walkthrough doctor [--capture]`); GPU fps comes from `--capture`, ElevenLabs is checked as key set / not set (no network call) |
| **Project state file** | Which takes are accepted, which checkpoint is current, picture-lock hash, sound/VO build inputs. A new session resumes instead of re-deriving. | folded in (`cli/lib/state.mjs`: `state.json`, `walkthrough-state/1`, written only by the CLI; takes, tour map, captions, builds, renders, reviews, sound, voice, deliveries, costs; `walkthrough state lock` for the picture lock) |
| **Disk policy** | Frame cache and renders to a buffer path when the internal disk is short; rejected takes deleted at once; `caffeinate` during renders. | partly: `cli/lib/disk.mjs` for `render`, `sound` and `deliver` (5 GB rule, `buffer` spill, `caffeinate -i`); deleting rejected takes is still by hand |
| **Cost ledger** | Model per step, agent turns, ElevenLabs credits, render minutes, written into `REVIEW.md`. | folded in (`walkthrough cost add` / `cost show`; render minutes from `render`, TTS characters and music seconds from the voice and sound tools; copied into the review bundle as `costs.md` and summarised in `REVIEW.md`). Model per step and agent turns are added by hand (`cost add --kind agent`) |
| **Parallel takes** | Independent takes from different checkpoints on different ports when the machine allows. | partly: site mode is folded in (`recorder/takes/run.mjs --parallel N` / `walkthrough take --parallel N`: one browser per take, captures together, encodes only when no take is capturing; refused with a studio). Open: takes on their own ports and checkpoints (the runner starts no servers, so takes share the project's `baseUrl`, and a studio has one database). On a loaded machine capture gaps grow (site-test: 2 takes in 31 s instead of 58 s, gaps up to 114 ms) |

## 6. Delivery

| Item | Why | Status |
|---|---|---|
| **Package presets** sales deck / website embed / social / docs | Same films, different cuts: per-feature clips, 9:16 cuts, GIFs for READMEs, poster frames, VTT, chaptered YouTube description from the captions. | folded in (`delivery/run_preset.py`, `delivery/presets.json`, `walkthrough deliver --preset sales\|web\|social\|docs`); vertical social clips take a 9:16 render (`--aspect 9:16`) |
| **Docs mode** | Per-feature 10–20 s clips with captions as product documentation, regenerated when the UI changes (same scenes, new take). | folded in (the `docs` preset: 10–30 s clip, `.srt`, GIF ≤ 8 MB, poster and `index.md` per scene group) |
| **Licence check in the package** | Generated music/voice terms recorded next to the files so the owner confirms before public use. | folded in (README note) |

## Next

The open and partly items above, in the order that removes the most work per film:

1. **Guided "record the login"**: one command that opens the sign-in page, waits for the owner to sign
   in, and saves and checks the storage state (today `recorder/tools/save-login.mjs` by hand).
2. **Time-lapse auto-detection** in kept footage: any wait over N s becomes a labelled time-lapse unless the
   storyboard says otherwise.
3. **Themes**: light and dark ground and lockup variants, named in `brand.json`.
4. **Music fallbacks**: a local library folder and the HeyGen catalog when there is neither a connector nor a
   key, and holds nudged onto bars from the beat grid.
5. **Hosting the review page**: publish the bundle's static page (HyperFrames `publish` or an artifact page)
   so a stakeholder comments without the project folder.
6. **Parallel takes on their own ports**: each take with its own server and checkpoint, so parallel works
   in studio mode too.
7. Smaller: deleting rejected takes under the disk policy; the tour map reaching screens behind clicks
   (client-side routes, dialogs, tabs); a dialog box drawn in the film from a `dialog` event; `place.py`
   carrying anchors as `tts.mjs` does.
