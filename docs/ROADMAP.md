# Roadmap: from one film to a recording studio for coding agents

*Mode: explanation. What is planned, not built. Shipped changes are in [`CHANGELOG.md`](CHANGELOG.md).*

What the kit does today was built for one film of one app. This file lists what would make it a
general screen-recording studio that an agent can point at any app or website and get a touring
or walkthrough video back, with captions or an ElevenLabs voiceover. Items are grouped by value
per effort. "Folded in" items were added during the extraction (2026-11-09); the rest is open.

## 1. Point it at anything

| Item | Why | Status |
|---|---|---|
| **Site mode** (URL + optional storage state, no studio instance) | Most tours are of a running site or a staging URL, not an owned monorepo. | folded in (recorder) |
| **Generic waits** `waitQuiet` (network idle + no DOM mutations) | App-specific turn detection (`POST /api/chat`) does not exist for a site you don't own. | folded in |
| **Declarative scenes** (scenes as a `.json` list of steps: click/type/hover/scroll/reveal/mark/wait/hold/nav/press/park by role+name, text, label, placeholder, testId or selector) | A scene should not need JavaScript for the common case; the agent writes data, the runner interprets it. The JS adapter stays for complex apps (agent turns, uploads). | folded in (`recorder/takes/steps.mjs`, `npm run site-test`) |
| **Tour map / explore step** | Before a storyboard exists, an agent crawls the app with the accessibility tree and records screens, controls and their boxes. The storyboard is then drafted against real labels, not guesses. `recorder/tools/explore.mjs` is the seed. | open, next |
| **Auth helpers** | Record a login once (outside the take), save storage state, reuse across takes and sessions. Cookie/consent banners dismissed from a config list before the sync flashes; analytics blocked by URL pattern. | folded in (`storageState`, `dismiss`, `blockUrls`); a guided "record the login" command is open |
| **Viewport presets** desktop / tablet / phone (device emulation) | Mobile tours need a phone frame in the film and a phone viewport in the recorder. | recorder side folded in; film phone bezel open |
| **Multi-tab, downloads, dialogs** | Export flows open new tabs and save files; the recorder should follow the active page and log downloads as events the editor can show. | open |
| **Scroll-safe targets** `scrollIntoViewSafe` | A click target at the viewport bottom cost 70 px of a card in the finished film. | folded in |

## 2. Cut the editing cost

| Item | Why | Status |
|---|---|---|
| **Draft storyboard from events.json** | Every click → camera framing + caption placeholder; every long wait → time-lapse range. The editor refines instead of writing from zero. The biggest token saver in the pipeline. | folded in (`film/scripts/draft-storyboard.mjs`) |
| **Build audit** (`build.mjs --audit` / `scripts/audit.mjs`: frozen holds, pointer jumps at cuts, dead air before cuts, caption lint, caption claims against `mark` text) | These were all found by hand or by the user on the finished film. On the delivered Kleber EDL it reports 0 errors and 2 dead-air warnings. | folded in |
| **Caption drafting from labels and marked text** | `mark` events now carry the element's visible text; a Sonnet pass can draft short captions from label + text + scene intent, with the truth check built in. | open, next |
| **Pointer bridging at cuts** | When the pointer would jump more than N px across a cut, emit a short bridging move or hide/show instead of teleporting. | open, next |
| **Time-lapse auto-detection** | Any wait longer than N s in kept footage becomes a labelled time-lapse unless the storyboard says otherwise. | open |
| **Aspect presets** 16:9 / 9:16 / 1:1 | Social cuts and vertical tours. A portrait film needs a portrait capture (the recorder's `phone` preset exists), plus its own title/end-card and caption layouts; the 16:9 constants to replace are listed in `docs/LOOK.md` "Roadmap: 9:16 and 1:1". | recorder side done; film layout open |
| **Themes** | Light ground, dark ground, brand lockup variants; all in `brand.json`. | partly (brand.json) |
| **Golden test** | Sample take + demo storyboard → `build --dry` table and a frame checksum set, run by `npm test`, so changes to `film/lib` cannot silently move the cut. | open, next |

## 3. Sound and voice

| Item | Why | Status |
|---|---|---|
| **Per-line voiceover generation with a cache** | One TTS request per line, keyed by text hash + voice. Re-timing or rewording one line regenerates one line, not the whole track. | open, next |
| **Script-first timing mode** | Today picture leads and the VO is fitted. For tutorial-style tours the voice should lead: the film stretches holds to the spoken line durations. Needs the EDL to accept per-range "fit to audio" targets. | open |
| **Multi-language twins** | Captions and VO in other languages from the same picture lock: translate the caption/VO JSON, run TTS, re-place. The app under test spoke 8 languages; the film could too. | open |
| **Pronunciation lexicon** | Brand names mispronounced by TTS ("Kleber") fixed once per project with spelling hints or phonemes, applied to every line. | open |
| **Automatic listening proxy** | Transcribe the final mix with `hyperframes transcribe` and diff it against the script (missing words, wrong words); measure VO/music ratio per line; detect clipping. Still reported as "measured, not heard". | open, next |
| **Music fallbacks** | ElevenLabs via API key when no connector is attached; a local library folder; HeyGen catalog. Length-aware prompt; generic beat-grid detection (`sound/analysis/`) to auto-nudge holds to bars. | partly (loop extension, grid) |

## 4. Review that scales

| Item | Why | Status |
|---|---|---|
| **Review bundle** (`review/` folder: contact sheet per scene, cut strips, holds report, pointer-jump report, caption lint, audio report, one `REVIEW.md`) | One command produces everything the critic and the human look at. | partly (scripts exist, not one command) |
| **Fixed critic checklist** | Logo over lettering, cut-off UI, skeletons left visible, dev badges, wrong zoom target, frozen holds, caption truth, pointer teleports, text under 28 px, phone-width legibility. | folded in (`review-film` skill) |
| **Human review page** | Publish the draft (HyperFrames `publish` or an artifact page) with the review bundle so the stakeholder can comment on timestamps. | open |
| **Describer → critic protocol** | Haiku describes frames factually; Opus judges against the storyboard and LOOK.md. Keep the two apart so the cheap model never grades its own reading. | folded in (agents) |

## 5. Operating it

| Item | Why | Status |
|---|---|---|
| **One CLI** `walkthrough init | doctor | studio up/down/checkpoint/restore | capture-test | take | draft | build | audit | sound | vo | review | deliver` | Today the steps are separate scripts in separate folders with their own flags. | open, next |
| **`doctor`** | Checks ffmpeg (and whether it has `drawtext`), hyperframes version, Chromium, GPU headless fps, disk space on the buffer path, ElevenLabs reachability. Every one of these bit us once. | open, next |
| **Project state file** | Which takes are accepted, which checkpoint is current, picture-lock hash, sound/VO build inputs. A new session resumes instead of re-deriving. | open |
| **Disk policy** | Frame cache and renders to a buffer path when the internal disk is short; rejected takes deleted at once; `caffeinate` during renders. | documented, not automated |
| **Cost ledger** | Model per step, agent turns, ElevenLabs credits, render minutes, written into `REVIEW.md`. | open |
| **Parallel takes** | Independent takes from different checkpoints on different ports when the machine allows. | open |

## 6. Delivery

| Item | Why | Status |
|---|---|---|
| **Package presets** sales deck / website embed / social / docs | Same films, different cuts: per-feature clips, 9:16 cuts, GIFs for READMEs, poster frames, VTT, chaptered YouTube description from the captions. | partly (clips, stills, showcase, copy) |
| **Docs mode** | Per-feature 10–20 s clips with captions as product documentation, regenerated when the UI changes (same scenes, new take). | open |
| **Licence check in the package** | Generated music/voice terms recorded next to the files so the owner confirms before public use. | folded in (README note) |

## Suggested order

1. `doctor` + one CLI (removes most setup friction for a new project).
2. Tour map (declarative scenes are folded in; the map makes "any website" real without guessing labels).
3. Caption drafting + pointer bridging + golden test (finishes the editing-cost work).
4. Per-line VO cache + listening proxy (makes the voiceover twin cheap to iterate).
5. Aspect presets + package presets (new outputs from the same takes).
