# Lessons

*Mode: explanation. A record of what went wrong on the first film and where each fix now lives; read it before planning.*

What went wrong or nearly wrong on the first full run (Kleber Content AI, 6-9 November 2026), and the fix
that is now built into the kit or its rules. Each entry is problem → fix → where it lives now.
Read this before planning a new film. Agents: when one of these applies to your step, follow the fix
without asking.

## Capture and recording

| # | Problem | Fix | Where it lives |
|---|---|---|---|
| C1 | The Chromium headless shell passed the capture test on a synthetic page but delivered only 10-14 unique fps on the real app (software rendering under real layout and image decode load). | Record with full Chromium in new-headless mode with GPU rendering, `--force-device-scale-factor=2`. Measure unique fps inside stretches where the app animates, not the whole-take average (static stretches drag the average down and hide nothing). | `recorder/`, `docs/CAPTURE_TEST.md`, skill `record-takes` |
| C2 | The first real pass was recorded on a stale web build while the clone was being rebuilt (the user had just pushed a UI change they wanted in the film). | Before any take: sync the studio clone with the app repo (diff `apps/` and `packages/`), rebuild, restart, and only then record. Never record while a build runs. When the app changes mid-job, stop, discard takes made on the old build, rebuild, re-record. | skill `record-takes` preflight |
| C3 | CPU load from renders, ffmpeg cuts or builds on the same Mac caused frame stalls in takes. | While a take is being recorded nothing else heavy runs: editors write code and `--dry` runs only. The lead announces "recording finished" before renders start. | skill `walkthrough-film` (scheduling rule) |
| C4 | A sub-agent (the app fixer) restarted the studio core mid-retake to load a renderer fix. Nothing was lost, but only because it was checked. | Only one agent owns the studio stack at a time. After any unexpected restart, compare app state with the last checkpoint and redo the take from it if disturbed. Agents other than the take operator are told in writing not to restart, rebuild or restore the studio while takes run. | `CLAUDE.md` guardrails, agent `app-fixer` |
| C5 | The redesign prompt asked for "photo on top, text in a red block underneath", but the result was shown on the 1:1 format where that layout reads differently. The viewer would see a mismatch between the prompt and the result. | Select the format the prompt is about *before* sending the prompt, so the result lands on the visible format. Accept a take only if a viewer who read the prompt sees it fulfilled. | skill `record-takes` truth checks |
| C6 | The Display ads formats showed grey skeleton placeholders: the ads sit below the fold of the app's mock page and their images never loaded on screen. | Scroll each preview into view in the take and wait for its images to finish loading. Never hold a placeholder on screen for more than a few frames outside an agent wait. | skill `record-takes`, skill `build-film` |
| C7 | Key presses switched the app into "keyboard mode", which disabled its entrance animations until the next pointer press. Enter would also have sent the message without a visible click. | Type into fields, then click Send with the pointer. Never press Enter to send; never press Escape during an agent turn (it stops generation). Check the target app for any input-modality behaviour during exploration. | app adapter, skill `record-takes` |
| C8 | Agent turns were first detected by on-screen labels, which change with the UI language. | Detect agent turns from the network (the chat request finishing and the submit button returning), then classify the result (success, question, error). | app adapter |
| C9 | The composer growing to a second line during typing froze capture for 150-260 ms at a few repeatable moments. | The take index lists every frame gap over 100 ms outside agent waits, with what is on screen; the editor excises those stretches where the pointer is at rest. Retake only for a wrong result on screen or a failed sync, not for isolated short stalls. | `takes/INDEX.md`, storyboard `excise` |
| C10 | The settings scene's footage put the clicked control at the top edge of the viewport and the preview card's button below the bottom edge, so no camera framing could show both. | When a scene's subject is "click X, watch Y change", scroll so both X and Y are inside the viewport before the clicks; mark both boxes. | skill `record-takes` |
| C11 | Hover outlines from the invisible mouse stayed visible on creatives after the pointer had "moved on" in the story. | Park the mouse off interactive content between actions; keep the resting mouse more than 56 px from fading chip-row edges (rows auto-scroll there). | recorder driving rules |
| C12 | The 1 CSS px heartbeat (timing marker) in the top-left corner showed in zoomed framings of that area. | The editor covers it in the cut (a drawbox in the sampled page colour) without changing the frame size. | `film/` |
| C13 | A one-time sign-in link is consumed on first use. | Issue the link, then checkpoint (CP0). Restoring CP0 makes the link unused again. Store it in `link.txt`, never in reports or logs. | `studio/`, skill `record-takes` |
| C14 | The language menu showed 6 of 8 languages without scrolling, so the film could not show the claimed count. | Scroll menus so every item that a caption counts is seen; or caption only what is visible. | truth checks |

## Editing and review

| # | Problem | Fix | Where it lives |
|---|---|---|---|
| E1 | The settings scene's camera zoomed to the wrong box: the clicked control sat at or above the top edge of the frame while the camera held on the preview. The owner caught it after delivery. | Frame the camera on the clicked control's logged box (its whole row) together with the thing that changes; at every click both must be fully in frame. The critic checks every click frame for "is the clicked control in frame". | skill `build-film`, agent `film-critic` checklist |
| E2 | A frozen hold of almost 2 s at 1:03 looked like a stall. 18 such holds were found across the film once someone looked. | Run `$KIT/film/scripts/holds.py` (from the film's project folder; also part of `build.mjs --audit`) after every build before picture lock; trim static holds over about 1 s unless the moment is the point (then spotlight it). | skill `review-film` |
| E3 | The pointer jumped 340-485 px across nine hard cuts. | Treat each cut: fade or slide the pointer off before the cut and bring it in from the nearest edge after; or end the outgoing shot on a punch-in that leaves the pointer out of frame; or replace the cut with a push or whip where the story has a break. Avoid nine identical treatments. | `film/`, skill `build-film` |
| E4 | The status line "Noting that for next time…", the point of its scene, was on screen for 0.8 s. | Play that stretch slowed (about 0.4x) with a spotlight and the caption landing on it, pointer at rest. A slow-down carries no time-lapse tag; slow nothing else. | storyboard `rate`, skill `build-film` |
| E5 | The dealer logo was invisible on a red creative, so the caption "Your logo first" claimed something the viewer could not see. A later option showed the dealer logo over lettering in the artwork for about 3 s. | A caption is cut or rewritten when its claim is not visibly true. Add "logo over lettering / logo unreadable on its background" to the frame review list; fix the app (agent `app-fixer`) or cut the moment. | honesty rules, agent `film-critic` |
| E6 | The small-model frame read-back over-reported: of ~12 flags, several were by design (caption band, time-lapse plate) or misreads. | Describers report facts only; an Opus critic rules on each flag (real / by design / misread) by extracting frames itself. Never act on an unverified describer flag. | skill `review-film` |
| E7 | Two long agent reports were cut off in transit (the critic's and the packager's). | Long reports go to a file in the scratchpad; the message carries the path and a short summary. | all agent definitions ("How to report") |
| E8 | The editor agent went idle twice after starting a render in the background and never came back to report. The lead had to run the sound build itself. | Agents run renders in the foreground (raise the tool timeout, or split the render) and report when it finishes. | agent `film-editor`, skill `build-film` |
| E9 | Rendering the voiceover twin twice was nearly needed because the picture was re-timed after the VO was placed. | When picture timing changes, the editor does a `--dry --dry-out` run first, the voiceover producer checks every line against the dry-run EDL, and only when "all lines fit" does the editor render. | skill `voiceover`, skill `build-film` |
| E10 | Clips cut from the voiceover film risked cutting a spoken line in half at scene boundaries. | `delivery/clips.py` moves a boundary up to 1 s to a gap in speech, or stops and asks for the two scenes to be merged. | `delivery/clips.py` |
| E11 | Stills taken from the film carried the empty caption band at the bottom, dead space on a slide. | Stills come from the captionless variant, cropped to the window area (band dropped); full 16:9 frames are kept in a subfolder. | `delivery/stills.py` |
| E12 | ffmpeg on the Mac had no `drawtext` filter, so labelled contact sheets failed. | Contact sheets and strips are drawn with Pillow. | `delivery/contact_sheet.py` |

## Sound and voice

| # | Problem | Fix | Where it lives |
|---|---|---|---|
| S1 | The delivered "final" was silent: the file the owner opened was the picture-only render. | `sound/build-sound.mjs --deliver` renames the silent render to `*.picture-only.mp4` before muxing, then proves the result has an audio stream of full length with loudness in range at start, middle and end, and prints `delivered: <path>` as its last line (or `NOT DELIVERED`). Nothing is announced as delivered without that line. `delivery/verify.py` refuses a package with a silent video. | `sound/build-sound.mjs`, skill `film-sound` |
| S2 | ElevenLabs Music returned 135.7 s when 195 s was requested (and 43.2 s for a second take). | Do not regenerate (each call costs credits). Extend the bed by bar-aligned loop repeats at clean splice points, keeping the real intro and the real ending; verify each join by measurement. | `sound/`, skill `film-sound` |
| S3 | "Free generations are busy right now" from ElevenLabs (music twice, speech twice). Nothing was charged, but the tool says not to retry in the same turn. | Never call a generation again in the same turn. Retry on a later turn (a timer or the next user message). Each successful call charges credits; one take of speech is enough. | skill `film-sound`, skill `voiceover` |
| S4 | Whooshes disappeared under the music when the limiter had no headroom. | Dip the music 2-3 dB for about 0.3 s under each whoosh; report the measured whoosh-to-music difference. | `sound/` |
| S5 | Scene changes landed between beats. | Anchor the bed so bar lines fall on a fixed grid from film time 0 (2.5 s bars at 96 BPM); write `beat-grid.json`; the editor nudges scene changes and the format tour onto it with holds only, never footage speed. | `sound/`, skill `build-film` |
| S6 | Nobody on the job could listen to the music or the voice. | Every audio report says "measured, not heard". The handover lists listening checks for a human (named words, times). | skill `film-sound`, `docs/DELIVERY.md` |
| S7 | The licence of free-tier ElevenLabs output for commercial or public use was not verified. | The package README carries it as an open check for the owner, stated plainly, not as a legal statement. | `docs/DELIVERY.md` |

## Agents and orchestration

| # | Problem | Fix | Where it lives |
|---|---|---|---|
| A1 | The app fixer tried to spawn its own sub-agent; the user declined it, but a short-lived one had already edited files and was then interrupted, leaving half-done edits. | Worker agents do not spawn sub-agents unless the lead says so. After an interruption, the next agent reads `git status` and file modification times, treats existing edits as an unfinished draft, and checks them critically before continuing. | agent definitions |
| A2 | Messages to a busy agent crossed with its work (the editor built from an old instruction while new rulings were in flight). | The lead numbers its rulings, says which earlier message a new one supersedes, and asks the agent to re-read before applying. Agents check for newer messages before a long step. | skill `walkthrough-film` |
| A3 | Another session committed in the same repo while the app fixer worked. | Commit only the files your change touched; check modification times before editing; stop and report if a file changes without you. | agent `app-fixer` |
| A4 | `git push` failed with "unexpected disconnect while reading sideband packet" on a large pack. | `git -c http.postBuffer=524288000 push`. Never force-push; rebase if the remote moved. | `CLAUDE.md`, agent `app-fixer` |
| A5 | `rm -f` and `zip` failed in zsh because of interactive aliases ("Un-recognized argument -f"). | Call `/bin/rm` and `/usr/bin/zip` by absolute path in scripts and agent commands. | `delivery/zip.sh`, `CLAUDE.md` |
| A6 | Disk space: the Mac had 8-11 GB free at the start; renders need 3-8 GB of frame cache. | Check free space before each heavy step; if a step would leave under 5 GB, put its large files on the external buffer drive (never live capture or the studio database). Delete rejected takes and raw frames once a master verifies. | skill `walkthrough-film` preflight |

## Owner feedback that changed the app, not the film

The owner watched drafts and asked for app fixes before re-recording (onboarding upload component, small
packshots on large colour fields, loud on-image edit chips, a 4:1 banner composition, dealer logo sized to
the brand logo's height, logo contrast on red, missing menu icon, a hard-to-see back link, a poor preview
card). The pattern to keep: the film is a review tool for the app. When the owner's notes are about the app,
fix the app with `app-fixer`, verify on camera at the capture size, commit, rebuild the studio, and retake
from CP0. Do not paper over app issues in the edit.
