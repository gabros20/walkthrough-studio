<!--
The approved plan for the Brightpost walkthrough film (6 November 2026), kept nearly verbatim as the
worked example of a plan: story table, look-and-motion numbers, pointer/camera/caption rules, studio instance,
takes and checkpoints, sound, verification, risks. The kit was extracted from a real client walkthrough job;
the example here is anonymised as Brightpost (names, products, industry and brand are fictional), the
external drive path was generalised, and the owner's to-do list (accounts, credits, drive) was removed.
What actually happened differs in places; see docs/LESSONS.md for the corrections:
- capture ran in full Chromium new-headless with GPU at 60 fps (the headless shell dropped to 10-14 fps on the real app);
- the final film is 3:02 (182 s), delivered in two variants: captions + music, and voiceover + ducked music, no captions;
- the app was fixed between passes (eight UI/renderer issues) and all takes were re-recorded;
- music came back shorter than requested and was extended by bar-aligned loops.
-->

# Brightpost: stakeholder walkthrough video (v2)

## Context

Brightpost stakeholders need a ~3 minute video showing how a shop owner uses Brightpost from start to finish. A first attempt exists (`videos/brightpost-walkthrough.mp4`, Nov 5) but is not presentable: 10 fps capture at 1x, no cursor, no zooms, dev badges on screen, content that changes between takes, timings that drifted ~10 s from the picture, and a "Make it funnier" step that never actually ran.

This plan rebuilds the pipeline so the result looks like a Screen Studio or Cap recording: real app footage, an animated pointer that leads the eye, camera punch-ins, captions timed to the actions, an opening title with the header lockup, a closing card, and an ElevenLabs music bed made to the final length.

Decisions you already made: about 3 minutes, the real Claude agent, English captions, storyline A (one shop, one task), a new fictional English shop ("Harbor Bikes") with an owner login, and an external drive as a backup buffer for when the Mac lacks space for large video files or renders.

## What you get

- `videos/brightpost-walkthrough-v2.mp4`: 1920x1080, H.264 + AAC, about 3:05, music mixed to about -16 LUFS. 60 fps if the capture test passes, otherwise 30 fps throughout.
- `videos/brightpost-walkthrough-v2.srt`: the captions as a sidecar file.
- `videos/walkthrough-v2/`: the editable HyperFrames project, recorder scripts, storyboard data, and a `REVIEW.md` stating what was measured and what was only looked at.
- A second music take, so you can swap by ear (I can measure audio but cannot hear it).

Nothing in `apps/` or `packages/` is changed. The first video and its project stay as they are.

## Tools, and why each

| Job | Tool | Why |
|---|---|---|
| Drive the app | Playwright (Node), scripted takes | Exact control: role/name locators, real mouse paths, element boxes, network waits, a DevTools session. agent-browser capped the old capture at 10 fps and reset its context on `record start`. |
| Capture | Chrome DevTools screencast at 2x pixel density, each frame stamped by the browser | Sharp enough to zoom; frame times share a clock with the action log. Fallback: headed Chrome + ffmpeg screen capture at 60 fps. |
| Cut, pointer, zooms, captions, titles | HyperFrames (`npx hyperframes`, pinned 0.9.16) | Deterministic HTML-to-video, already used in this repo. Pointer, camera and captions are generated from data, so a re-cut never desyncs them. |
| Encode and cut footage | ffmpeg 8 | Installed. |
| Music | ElevenLabs Music v2.5 via the connector | Checked: instrumental, any length up to 10 minutes. |
| Click and whoosh sounds | The 21 sound files bundled with HyperFrames | Free, on disk. |

Not used: agent-browser recording (10 fps), computer-use / the cua driver (takes over your screen, least repeatable), the mock model (you chose the real agent).

## The story (storyline A: one shop, one task)

Sam at Harbor Bikes hears frost is forecast and needs a winter commuting campaign today. The same campaign travels through every feature. Captions are short lines (no voiceover). Every number in them comes from the code or from the recording itself.

| # | Film time | On screen | Captions (draft) |
|---|---|---|---|
| 0 | 0:00-0:08 | A 1.6 s burst of the real finished creatives from this session, then a teal slant wipes in and the header lockup (Brightpost logo, divider, "Brightpost") lands with the title. | "One sentence in." / "A ready-to-post campaign out." |
| 1 | 0:08-0:21 | **Set up once.** Sam opens the one-time sign-in link, confirms company and name, uploads the company logo (shown on dark and on light), clicks "Create your first post". | "A shop joins with a one-time link" / "Add your logo once. It goes on your posts." |
| 2 | 0:21-0:46 | **Ask.** Start screen. Pointer opens the platform picker (six platforms), keeps Instagram, types one sentence: "First frost is forecast this weekend. Winter commuting posts for the Ridgeline 7." The agent's steps run as a labelled time-lapse; three option cards and the preview arrive at normal speed. Spotlight on the app's own "Worked for N s". | "Describe the post in your own words" / "Three on-brand options, built only from the brand hub" / "Every image is checked before you see it" |
| 3 | 0:46-1:03 | **Choose.** Click Option 2, 3, 1. Click the format chips (1:1, 4:5, Story 9:16). Edit the post text inline, then the headline on the image itself; "Saved" appears. | "Three versions to choose from" / "Sized for feed and story" / "Click any text to edit it, even on the image" |
| 4 | 1:03-1:20 | **Refine.** "Modify" on option 1, type "Try a new design: photo on top, text in a teal block underneath." Time-lapse, then the new layout replaces the old. Pointer passes over the suggested-change chips. | "Ask for a change in plain words" / "A new layout, same brand rules" |
| 5 | 1:20-1:42 | **Expand.** "Add platform": LinkedIn, Facebook, TikTok, Display ads, Newsletter (no AI call). Then a rhythmic click-through of every format, cut on the music. | "Add a platform. No waiting on AI." / "6 platforms. 18 formats. One option." |
| 6 | 1:42-2:02 | **Translate.** Language menu: Deutsch, Français, Magyar, back to English (the whole app relabels). Then "Modify" on option 2: "Translate this option into German: headline, button, post text and hashtags, including the text on the image. Keep the design." German text on the image and in the post; a flick through two platforms shows it everywhere. | "The app speaks 8 languages" / "Ask for the post in another language" |
| 7 | 2:02-2:14 | **Teach.** In chat: "From now on, always end our posts with 'Free safety check for every customer.' And we're closed on Sundays." Spotlight on the status line "Noting that for next time…". | "Tell it a rule once" |
| 8 | 2:14-2:36 | **Company profile.** Profile menu, Settings. Company name and logo; brand kit (colours Brightpost teal, button Pill, "Our logo first", "With a divider"), the live preview re-renders, Save. Scroll to Assistant memory: the saved notes with kind and date; pointer rests on delete. | "Set your defaults once" / "It keeps a note of what you told it" / "Saved notes go with every new request" |
| 9 | 2:36-2:52 | **Proof.** Back to the app: "Now an all-season post for the Coastline 3." Time-lapse, three options. Callouts on the evidence: the sign-off line in the post text, shop logo first, pill button. | "The next campaign follows your notes and your brand kit" |
| 10 | 2:52-3:03 | **Export.** Export sheet: platform tabs, "Download everything (zip)", one image download, "Copy" on the text. Then the real files from the downloaded kits fan out, with the measured count. | "Download the kit. Paste the text. Post." |
| 11 | 3:03-3:10 | Teal slant closes over the kit; lockup and closing line hold 2.5 s; music resolves. | "From one sentence to every channel." |

Honesty rules: agent waits are labelled time-lapses, and the true duration is shown by the app's own "Worked for N s" line. The opening burst and the closing fan-out use only files produced in this recording. Nothing is mocked or redrawn. A caption is cut if its claim is not visibly true in the take.

## Look and motion (the numbers)

- **Canvas:** 1920x1080.
- **Ground:** Ink `#141414` (the app's own brand-kit colour), flat. The app runs in light theme so the window separates clearly.
- **Window:** captured at 1440x810 CSS px, 2x density (2880x1620). Wide framing shows it at 1536x864, 36 px from the top, 16 px corner radius, shadow `0 28px 70px rgba(0,0,0,.45)`. That leaves a 180 px band below for captions, so they never cover the composer.
- **Type:** Roboto, the brand typeface (from the app's creative font list), bundled in HyperFrames. Titles Roboto Black 900, 92 px, -1.5% tracking. Captions Roboto Bold 700, 38 px. Nothing below 28 px.
- **Accent:** Brightpost teal `#0E7C86`, only on the title wipe, the caption tick, the payoff and the end card.
- **Logo:** the real files `public/brand/brightpost-logo-white.png` and `-black.png` (800x203), never redrawn, never wider than 800 px. Lockup proportions taken from the app's own logo component.
- **Eases by role:** arrivals `expo.out`, camera `power2.inOut`, exits `power3.in`; exits 40-50% shorter than entrances.
- **Transitions (four kinds, each caused by something on screen):** teal slant wipe (title, end), camera push through the clicked control (between app scenes), whip in the format montage, hard cuts on the beat inside the montage.
- **Banned in this film:** a dark void with small floating UI, glow, glass cards, everything fading up the same way, a title over a dimmed screenshot, the logo docked in a corner, bouncing UI, typing as the very first shot, invented screens.

## The pointer

The footage is recorded with **no cursor**. The pointer is drawn afterwards from the recorder's own log, so it stays smooth and can never drift from the UI.

- **Shape:** SVG arrow, pointing hand and text I-beam (black fill, 1.5 px white edge, soft shadow), chosen from the CSS cursor the page reported under the mouse. 44 px tall in wide framing (4% of frame height); it scales with the camera to about 75 px (7%) in punch-ins.
- **Path:** one tween per move along a gentle arc (control point offset 8% of the distance). Duration `clamp(0.35 + distance/2400, 0.40, 0.90)` s, ease `power3.inOut`. It enters from off-screen in scene 1 and never teleports.
- **Hover sync:** during recording the real, invisible mouse follows the same path in real time, so hover states in the footage match the drawn pointer. Clicks are sent as mouse down/up at the logged point, never as a jump-click.
- **Click:** the pointer arrives 0.18 s early; press is scale 1 → 0.86 → 1 in 0.18 s; a soft filled disc grows 28 → 64 px and fades from 28% to 0 in 0.35 s under the tip; a soft click sound lands one frame later.
- **Pointing without clicking:** when the thing to look at is not under the pointer (status line, "Saved", memory notes, the proof callouts), everything else dims 35% for the hold and a 3 px rounded outline traces the element's logged box. At most six times in the film.

## The camera

- Three framings: **wide** (whole window on the ground), **pane** (chat or preview fills the frame, 1.3-1.5x), **control** (one control or line of text, up to 1.85x, which is the capture's native pixel limit; text stays at least 26 px).
- Moves take 0.45-0.6 s with render-time motion blur, arrive just before the pointer needs the control, then hold dead still while the UI acts.
- Built as `scale`, `x`, `y` tweens on a wrapper around the video. The pointer and spotlights sit inside the same wrapper, so they move with the screen.
- Targets come from logged element boxes, never guessed pixels.

## Captions

- One line at a time, at most 10 words, bottom centre at y 915-965 (inside title-safe), on a slanted ink plate (the brand's button shape) with a small teal tick.
- Each caption is **anchored to a logged event** ("0.2 s before the click on Export"), not to typed-in seconds. The build script converts anchors to film time, so re-cutting never breaks timing.
- Hold: at least 0.5 s + 0.3 s per word; the last line at least 2.5 s. Entrances vary by scene; landed text never moves.
- All captions live in one captions track with a hard hide at each end. The same data writes the `.srt`.

## Where the files go

**The Mac's disk comes first. The external drive is the backup buffer**, used only when a step would not fit.

The rule, checked before every large step: if doing the step on the Mac would leave less than 5 GB free, that step's large files go to the external drive instead. Everything is addressed through one `buffer` path, so switching is a setting, not a rewrite.

| What | Size | First choice | If the Mac is short |
|---|---|---|---|
| Live studio database, its checkpoints (APFS clones), render cache | about 1 GB | Mac: `../brightpost-studio/` | stays on the Mac (see below) |
| Frozen tree clone and its production build | about 0.5 GB | Mac: `../brightpost-studio/tree/` | stays on the Mac |
| HyperFrames project and pre-cut scene clips | about 0.5 GB | Mac, in the repo: `videos/walkthrough-v2/` | stays on the Mac |
| Raw take masters (one take at a time is under 1 GB) | 1-4 GB in total | Mac: `../brightpost-studio/takes/` | verified takes are moved to the drive to make room |
| Frame cache during renders (`--frames-cache-dir`, `TMPDIR`) | 3-8 GB | Mac | external drive |
| Draft and delivery renders | 1-2 GB | Mac | external drive |
| Final `.mp4` and `.srt` | under 150 MB | repo `videos/` | repo `videos/` |

What always stays on the Mac, about 2 GB: the running app, its database and the checkpoints. A live database on a USB drive would slow the app on camera, and the drive is HFS+, which cannot make the instant clones used for checkpoints.

When the drive is used:

- Files go in `<external drive>/walkthrough-buffer/`. The path contains spaces, so scripts reach it through a symlink, `../brightpost-studio/buffer`.
- Capture never writes to the drive directly. A take is recorded on the Mac and moved afterwards, so a slow or sleeping disk cannot cause dropped frames.
- `caffeinate` runs during renders so the Mac and the drive stay awake; each step first checks the drive is mounted and has at least 10 GB free.
- I tell you whenever a step spills to the drive.

Both the studio folder and the buffer folder are safe to delete once the video is accepted.

## Recording

**Studio instance (your dev setup and data are not touched).** The app itself runs from a sibling folder on the internal disk, `../brightpost-studio/`:

- A frozen clone of the working tree (`cp -cR`, an APFS clone that costs almost no space), so edits you make while I record cannot restart or change the app. Your uncommitted features (memory, brand kit, chat history) are included.
- A copy of `data/pglite`, taken twice and compared, because your dev server holds it open.
- Core started with `pnpm --filter @brightpost/server start` (not the watch mode) and `PORT=8797`, `PGLITE_DIR`, `RENDER_CACHE_DIR`, `WEB_BASE_URL=http://localhost:3011`, `PUBLIC_BASE_URL=http://localhost:8797`, `JOB_LOOP_MS=86400000`, `TELEMETRY=off` (so nothing reaches the tracing backend), `RATING_PARTNERS` set to hide the internal rating section, and `USAGE_PARTNER_LIMITS` raised for the demo shop so rehearsals cannot lock the composer.
- Web app as a production build in the clone, started as the standalone server on `:3011` with the root `.env`. That removes the DEV model chip and the Next.js badge. If the build fails: `next dev` from the clone with the model-picker request blocked and the Next indicator disabled in the clone's config.
- Shop: `shop-login.ts provision --id p_harbor_bikes --name "Harbor Bikes" --market INT --language en --channels instagram_feed,facebook`, then `issue --role owner` for the one-time link used in scene 1.
- A simple fictional wordmark for Harbor Bikes (SVG to a 1200 px PNG) is the logo uploaded in scene 1.
- Browser context: light colour scheme, motion not reduced, `brightpost_locale` cleared.

**Capture.**

- Playwright page 1440x810 at device scale factor 2. DevTools screencast frames are acknowledged immediately, saved with their browser timestamps, and placed into constant-rate slots by timestamp (this is what removes the old drift). Take masters: H.264 CRF 12. Scene clips: CRF 14, one keyframe per second.
- **Capture test first.** A 30 s frame-counter page, then 60 s during a real agent turn, tried three ways in order: screencast at 2x, screencast at 1.5x, headed Chrome + ffmpeg screen capture at 60 fps.

  | Check | Pass |
  |---|---|
  | Frame size | exactly 2880x1620 (or 2160x1215 at 1.5x) |
  | Unique frames per second | median ≥ 57 idle, ≥ 50 under load |
  | Longest gap between frames | ≤ 100 ms |
  | Clock drift between two sync flashes 5 min apart | ≤ 1 frame |
  | Reference red patch after decode | within ±3 per channel |

  The first method that passes is used at 60 fps. If none passes, the whole film, overlays included, is delivered at 30 fps so pointer and footage always match.
- A 100 ms full-screen sync flash at the start and end of each take ties the frame clock to the action clock; it is cut from the film.

**Action log.** Each take writes `events.json`: `move` (with the page's cursor style), `down`, `up`, `key`, `scroll`, `waitStart`, `waitEnd` (with outcome), `mark` (with the element's box), `nav`. Times are seconds from the take's sync flash; positions are CSS px. This one file drives pointer, camera, spotlights, captions and sounds.

**Driving rules learned from the code.**

- Type, then **click Send with the pointer**. Any key press switches the app to keyboard mode, which turns off its entrance animations until the next pointer press (the app's motion provider). Never press Enter to send, never press Escape during a turn (it stops generation).
- Agent turns are detected from the network, not from labels (labels change with the UI language): wait for `POST /api/chat` to finish and the composer's submit button to return, then classify the result as success (suggested-changes list), question panel, or error. Timeout 6 minutes; the app's own watchdog ends a silent turn at 150 s.
- The mouse never rests within 56 px of a faded chip-row edge (the row auto-scrolls there).
- The logo upload uses a file-chooser handler, so no macOS dialog appears.
- Signed image links last 15 minutes; no take idles that long.

**Takes and checkpoints.** One continuous browser session, recorded in story order on the same campaign so content never changes between scenes. A checkpoint is: stop the core, clone the database folder, save the browser's storage state. A bad take is rolled back and redone, never patched.

| Take | Content | Agent turn | Checkpoint after |
|---|---|---|---|
| 0 | Database copy, provision shop, issue owner link | no | CP0 (restoring it makes the link unused again) |
| 1 | Sign-in link, confirm, upload logo, start screen | no | CP1 |
| 2 | The one sentence, three options | yes | CP2, only once all three options render with the shop logo |
| 3 | Options, formats, inline and on-image edits | no | none (redo from CP2) |
| 4 | Modify, new design | yes | CP3 |
| 5 | Add platforms, format tour, UI languages, German turn, back to English | yes | CP4 |
| 6 | The lasting rule | yes | CP5, once the memory API shows the notes |
| 7 | Settings: company, brand kit, memory | no | CP6 |
| 8 | Back to the app, second campaign | yes | CP7 |
| 9 | Export sheet; download both kits | no | none |

**Rehearsal before the real takes** (on throwaway clones of CP1 and CP2). Each agent step is tried and the storyboard is adjusted to what actually works:

- Take 2: how often the agent asks "Which market?" for an international shop. If it asks, either the sentence gains a market word or the question is answered on camera as a real feature.
- Take 4: the redesign prompt produces a visibly different layout.
- Take 5: the German turn changes the on-image headline and button (not just the post text), and how long it takes with six platforms.
- Take 6: the rule is saved as notes without re-rendering anything.
- Take 8: the new campaign carries the sign-off, the logo order and the button shape.

## Editing

- `storyboard.json` (the edit decision list): per scene, the kept source ranges as event anchors, time-lapse ranges and their film durations, camera framings by element, caption text and anchors, spotlight targets.
- `build.mjs` reads `events.json` + `storyboard.json` and writes the ffmpeg cut list, one pre-cut clip per scene (waits compressed in ffmpeg, constant frame rate), and the HyperFrames scene files with pointer tweens, click discs, camera moves, spotlights, captions and sound cues as static HTML with stable ids.
- One mapping function converts source time to film time: for a kept range, `film = filmIn + (source - srcIn) / rate`, with `rate = (srcOut - srcIn) / filmDur`, every bound snapped to a whole frame. Every overlay goes through the same function as the footage.
- Project layout: `index.html` (ground, scene hosts, captions host, music, sounds), `compositions/` (one file per scene, `title.html`, `end.html`, `captions.html`), `assets/`, `SPEC.md`, `STORYLINES.md` (the three storylines, for a later switch), `REVIEW.md`.
- HyperFrames contract throughout: one paused timeline per scene, `fromTo` only, no timers or randomness, video muted, bundled fonts, video frames extracted as JPEG into the frame cache (on the Mac, or on the backup buffer if the Mac is short).

## Music and sound

- Made **after** picture lock, to the exact film length plus a 2 s tail.
- ElevenLabs Music v2.5, instrumental. Prompt direction (no artist names, which the model may refuse): "Downtempo organic electronica, 96 BPM, warm electric piano chords, soft mallet and kalimba plucks, round sub bass, brushed broken beat, airy pads, light shaker. Calm and optimistic, modern product-launch feel. Sparse first 8 seconds, groove enters gently, a small lift at the second campaign, soft resolved ending. No vocals, no heavy drums, no drops, not techno." Section times are filled in from the locked cut.
- Two takes. I choose by measurement (tempo confidence, section energy, loudness, no clipping) and keep the other for you.
- The cut is then nudged to the music using holds only, never footage speed: scene changes within 0.3 s of a bar line where there is slack, the format montage on beats, the payoff and end card on strong beats.
- Sounds: a soft click on each real click, a short whoosh on the four scene-level transitions (two alternating takes), one riser into the end card; each 3-6 dB over the bed.
- Mix: music fades in 0.4 s and out 2.5 s under the end card; normalised to about -16 LUFS with true peak at or below -1 dBTP, then measured on the rendered file.

## Order of work

1. **Preflight:** check free space on the Mac and on the external drive, decide per step where its large files go, Playwright install, HyperFrames project scaffold.
2. **Capture test** and clock calibration; lock capture settings and frame rate.
3. **Studio instance** up; shop provisioned; logo drawn.
4. **Rehearsals**; storyboard adjusted.
5. **Record** takes 1-9 with checkpoints, reading back each take's frames before moving on.
6. **Rough cut:** build script, clips, pointer, camera; check and snapshot.
7. **Captions, title, end card, spotlights;** check, review sheets, fix.
8. **Picture lock,** then music and sound; nudge holds to the music.
9. **Review pass:** HyperFrames `check`, `snapshot --review` (scene starts, cut strips, phone width), an independent read of the sheets, fix the notes, write `REVIEW.md`.
10. **Preview for you,** then the delivery render and loudness measurement.

Estimated effort: about 30 agent turns including rehearsals and retakes, two ~3 minute music generations, and a render of roughly 20-40 minutes.

## Risks and fallbacks

| Risk | Fallback |
|---|---|
| Screencast fails the capture test | 1.5x density, then headed Chrome + ffmpeg screen capture (display set to sRGB so the brand teal does not shift), then 30 fps delivery. |
| Production build of the uncommitted tree fails | `next dev` from the clone with dev UI suppressed. |
| German turn leaves English on the image, falls back to "Book now", or is slow with six platforms | Translate before adding platforms (swap scenes 5 and 6), or use a new request written for the German market. The caption stays true either way. |
| The agent asks a question instead of composing | Answer it on camera (a real feature) or rephrase; measured in rehearsal. |
| The shop logo is missing from creatives | CP2 is only accepted when it is present; otherwise retake. |
| No note is saved | The rule uses "from now on" and "always", which the agent prompt treats as a save trigger; confirmed through the memory API before CP5. |
| The brand kit does not visibly change the next campaign | Scene 8's live preview is the proof and the unproven callout in scene 9 is dropped. |
| ElevenLabs refuses music generation | I tell you at once; alternatives are a paid plan or key, or a HeyGen catalog track after a free sign-in. |
| The Mac's disk is too full for a step | That step's large files go to the external backup buffer; checkpoints stay as APFS clones on the Mac; rejected takes are deleted at once. |
| The external drive sleeps, disconnects or is slow while in use | `caffeinate` keeps it awake; every step checks the mount and free space first; an interrupted render is re-run (the frame cache is reused). Capture never depends on the drive, so only the render gets slower. |
| Neither disk has room | I stop before the step and tell you how much is needed. |
| The film runs long | Scenes 3, 4 and 6 each carry a marked 3-5 s trim. Accepted range 3:00-3:15. |

## Verification

- **Capture:** the test table above, recorded; sync flash within one frame on every take.
- **Pointer sync:** a calibration take with a visible in-page dot under the mouse is overlaid with the drawn pointer; they must coincide at 10 sampled frames.
- **Truth:** key frames of every take are read back and checked against the app's own state (the redesign changed the layout, German is on the image, the notes exist in the memory API, the kit zips contain the counted files).
- **HyperFrames:** `npx hyperframes check --json` with zero errors; `snapshot --review` sheets read against the storyboard; pointer paths sampled with `keyframes --shot`.
- **Readability:** each caption's hold checked against its word count; no text under 28 px; phone-width sheet legible.
- **Audio:** `npx hyperframes audio <video> --json` on the final file: sound present, clicks on their pictures, loudness in range. Reported as measured, not heard.
- **Final file:** ffprobe confirms resolution, frame rate, codecs and duration; I read a 1 fps contact sheet of the whole film before handing it over.

## Files

- New, in the repo: `videos/walkthrough-v2/` with `recorder/` (take scripts and shared helpers for pointer paths, turn detection and logging), `storyboard.json`, `build.mjs` and the HyperFrames project. One `.gitignore` line for `videos/walkthrough-v2/assets/clips/`. The final `.mp4` and `.srt` are copied to `videos/`. Nothing is committed unless you ask.
- New, on the Mac outside the repo: `../brightpost-studio/` (tree clone, live database and checkpoints, render cache, takes, the `buffer` path).
- New, on the external drive only if the Mac runs short: `<external drive>/walkthrough-buffer/` (moved takes, frame cache, renders).
- Both folders outside the repo are safe to delete when the video is accepted.
- Read, not changed: the app's logo files and logo component, the shop provisioning script, the shared contracts (the 18 formats and 6 platforms quoted in captions), the campaign brief rules (market and channel), the English message catalogue (control names for locators), and the main app component (turn states).
