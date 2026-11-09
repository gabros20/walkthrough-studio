# 05 take-operator: Build recorder and capture test

- Spawned: 2026-11-06 11:04 UTC
- Agent name: `recorder`; model: `opus`; type: `teammate`
- Follow-up messages from the lead: 13

## Brief

You are building the screen-recording layer for a product walkthrough video that must look like a Screen Studio / Cap recording: sharp app footage with no OS cursor, plus a machine-readable log of every pointer move, click and wait, from which an animated pointer, camera zooms and captions will be generated later by a separate editing step (HyperFrames, HTML-to-video). Your job in this phase is the recorder library, a capture-quality test with measured numbers, and a written contract the editing agent can build against.

## Where things are
- Repo: `~/Documents/Work/Projects/kleber-content-ai` (pnpm monorepo, Node 24). Git tree is clean.
- The full plan: `~/.claude/plans/okay-first-i-want-serialized-falcon.md`. Read "The pointer", "The camera", "Recording" (Capture, Action log, Driving rules, Takes and checkpoints) and "Verification" before writing code; they are your spec. This brief adds to them.
- Your code goes in `videos/walkthrough-v2/recorder/` in the repo, with its own `package.json` in `videos/walkthrough-v2/`. Do not modify the repo's root `package.json`, lockfile or workspace config, and do not touch `apps/` or `packages/`. No commits.
- Playwright browsers already in `~/Library/Caches/ms-playwright`: `chromium-1234`, `chromium_headless_shell-1234`. Install the Playwright npm version that matches build 1234 so nothing needs downloading. ffmpeg 8 is installed.
- Take output goes outside the repo: `~/Documents/Work/Projects/kleber-content-ai-studio/takes/<take-name>/` (create with `mkdir -p`; another agent is creating sibling folders there in parallel, and is standing up the app on `http://localhost:3011` (web) and `:8797` (core). It is not ready yet, so this phase tests against local synthetic pages only).
- The developer's own dev servers run on ports 3000, 3001, 8787. Do not use, stop or disturb them.

## What to build
1. **Capture.** Playwright page at 1440x810 CSS px, device scale factor 2 (2880x1620), light colour scheme, reduced motion off. CDP `Page.startScreencast`, every frame acknowledged at once and stamped with the browser's own timestamp, then placed into constant-rate slots by timestamp to produce `master.mp4` (H.264 CRF 12, constant frame rate, bt709 tagged). Keep per-frame timestamps on disk so a take can be re-muxed. Memory and disk must stay bounded for takes up to about 6 minutes.
2. **Pointer driving.** A real but invisible mouse that follows the same path the drawn pointer will follow: one move = an arc (quadratic bezier, control point offset 8% of the distance), duration `clamp(0.35 + distance/2400, 0.40, 0.90)` s, ease power3.inOut, stepped at the frame rate. Clicks are mouse down / up at the logged point with the pointer arriving 0.18 s before the press. Typing with a natural, slightly irregular cadence that is deterministic (seeded). Log the CSS `cursor` style under the mouse at the end of each move and whenever it changes.
3. **Action log** `events.json`, all times in seconds on the `master.mp4` clock (t = 0 is the first frame of the master), positions in CSS px. Moves are logged as segments (start time, end time, from, to, control point) so the editor can rebuild the identical curve. Also: `down`, `up`, typing ranges with the text and the field's box, `scroll`, `waitStart`/`waitEnd` with an outcome, `nav`, and `mark` (a named element's bounding box at a moment, for camera targets, spotlights and caption anchors). Every event that an editor may want to anchor to carries a stable human-readable `label`.
4. **Sync.** A 100 ms full-screen flash at take start and end that ties the frame clock to the action clock; verify from the decoded master that logged times land within one frame. A calibration mode that draws a visible dot under the mouse in the page, so pointer sync can be checked later by overlaying.
5. **App driving helpers**, written from the code and to be proven against the running app in the next phase: send a chat message by typing and then clicking the send button with the pointer (never Enter: any key press puts the app in keyboard mode, which turns off entrance animations until the next pointer press; see `apps/web/src/components/motion-provider.tsx`); wait for an agent turn in a locale-independent way (the `POST /api/chat` response finishing and the composer's submit button returning, then classify the result as success, question panel, or error; 6 minute timeout); a file-chooser handler for the logo upload; a guard that keeps the resting mouse more than 56 px from the edges of fading chip rows. Read `apps/web/src/components/app/kleber-app.tsx` and the composer components for real selectors and states.
6. **`videos/walkthrough-v2/CONTRACT.md`**: the take folder layout, the exact `events.json` schema with one example of each event type, the time base, and how to run a take. The editing agent will read only this file to understand your output, so it must be complete and exact.

## Capture test (do this before polishing anything else)
Build a synthetic test page whose every animation frame is identifiable in the decoded video (for example a frame counter also encoded as a strip of black/white blocks, plus a Kleber-red `#FD000D` patch and some moving content), and measure, for each capture method in this order: (a) screencast at 2x in the headless shell, (b) the same in full Chromium new-headless, (c) screencast at 1.5x, (d) headed Chromium with screencast. Stop at the first that passes. Run 30 s idle and 60 s with the page under realistic load (CSS transitions, image decodes, a streaming-text simulation, and some CPU pressure).

| Check | Pass |
|---|---|
| Frame size | exactly 2880x1620 (2160x1215 at 1.5x) |
| Unique frames per second | median at least 57 idle, at least 50 under load |
| Longest gap between frames | at most 100 ms |
| Clock drift between two sync flashes 5 minutes apart | at most 1 frame |
| Kleber red patch after decode | within 3 per channel of 253,0,13 |

If nothing reaches 60 fps honestly, say so and measure what frame rate each method does hold steadily (30 fps delivery is the accepted fallback and is far better than duplicated frames presented as 60). Screencast only delivers frames when the page repaints; account for that when counting "unique frames" on a mostly static UI, and make sure the constant-rate master holds the last frame through static stretches without drifting. Do not use OS-level screen capture (ffmpeg avfoundation); if you conclude it is the only route to an acceptable result, stop and report that instead, because it needs the user's cooperation.

Write the numbers to `videos/walkthrough-v2/recorder/CAPTURE_TEST.md`.

Also record one sample take of about 15 s on a synthetic page with a few buttons and a text field (moves, clicks, typing, a scroll, two marks, calibration dot on) into `…/kleber-content-ai-studio/takes/sample/`, and confirm by extracting frames that the dot sits where the log says at five sampled times. The editing agent will use this take as test footage.

## Report back (short, plain text)
Which capture method and frame rate you locked and the measured table; the library's public API in a few lines; where the files are; what is proven versus only written from reading code (the app helpers will be in the second group); and any risk you see for the real takes. State failures plainly; do not describe an unverified step as done.

## Follow-up messages from the lead

### 2026-11-06 12:08 UTC

Capture test accepted: 60 fps, headless shell at 2x. Next phase is yours too: prove the app helpers on the real app, rehearse, then record the real takes.

THE APP
- Studio stack is up: web http://localhost:3011 (production build), core http://localhost:8797. Folder `~/Documents/Work/Projects/kleber-content-ai-studio/`: `bin/up.sh`, `bin/down.sh`, `bin/checkpoint.sh <name>`, `bin/restore.sh <name>` (checkpoint and restore restart the core; in-memory rate limits reset with it). `link.txt` holds the unused one-time owner sign-in link for dealer `p_summit_tyre` ("Summit Tyre Centre", user "Sam Carter"). `assets/summit-logo.png` is the logo to upload. Checkpoint `CP0` exists (link issued, core never started). Not yet verified: that restoring CP0 makes the link usable again. Verify it first; if it does not, issue fresh links with `packages/core/src/scripts/dealer-login.ts` in `tree/` (core stopped) and say so.
- Agent turns call real LLM providers and cost money. Budget: about 35 agent turns in total for rehearsals plus takes. If you are heading past that, stop and report.
- Nothing CPU-heavy may run beside a take. The film agent is idle and will not render while you record. Do your own encodes between takes, never during.

WHAT TO RECORD
The story table, driving rules, take list (takes 1-9), checkpoints (CP1-CP7) and rehearsal list are in the plan (`~/.claude/plans/okay-first-i-want-serialized-falcon.md`, sections "The story" and "Recording"). Follow them. Additions:

1. Rehearse on throwaway state first (restore afterwards): sign-in + logo upload; the first campaign sentence; the redesign prompt; add platforms then the German translate turn; the lasting-rule turn; settings; the second campaign. For each, decide from what actually happens, using the plan's "Risks and fallbacks" table. You may choose within those fallbacks without asking. Preferences: no "Which market?" question on camera if a natural rewording of the sentence avoids it reliably; if German does not reach the text on the image, try translating before adding platforms, then the other fallback. Send me a short note after rehearsals (what you chose and why, turn count so far), then carry straight on to the real takes without waiting for a reply, unless something falls outside the listed fallbacks.
2. One browser session for all real takes, in story order, same campaign throughout, calibration dot off. Checkpoint as the plan says. CP2 only when all three options rendered and carry the dealer logo; CP5 only when the memory API shows the saved notes.
3. Pacing: the editor can cut and time-lapse but cannot lengthen footage. Leave at least 0.5 s still before each action and 1.2 s after each visible result; 2 s on the big reveals (three options arriving, the redesign, the German version, settings preview re-render, the second campaign). Do not rush the format tour: about 0.6 s per chip.
4. Marks: be generous, the editor frames and spotlights only from logged boxes. At minimum, per take where present: chat pane, preview pane, composer, send button, each option card, the format chip row and each chip, platform picker and its items, the status line while the agent works and the final "Worked for N s" line, the "Saved" indicator, the edited text on the image, the Modify control and suggested-change chips, the language menu and items, each brand-kit control and the live preview, the memory notes list and one note's delete control, the export sheet's tabs and each download/copy control, and in the second campaign the three proofs (the sign-off sentence in the post text, the dealer-logo-first lockup, the pill button). Re-mark anything that moved after a layout change. Use stable, readable labels.
5. Truth checks per take, from app state not just pixels: the redesign changed the layout; German is on the image; the notes exist via the memory API; brand-kit values saved; the downloaded kit zips exist and you have counted the files in them. Save downloads into the take's folder.
6. Frame read-back per take: extract a handful of stills (downscaled) at the key moments and check them. If you have an Agent tool, delegate plain "describe what is on these frames" look-ups to a `haiku` model agent and then confirm yourself anything a decision depends on; otherwise look yourself. Accept a take only if, outside agent-wait ranges, the longest frame gap is at most 100 ms and sync verifies. A bad take is rolled back to the last checkpoint and redone, never patched.
7. Look at the first real screenshot of the app at 1440x810 before anything else: confirm the layout is the desktop one, nothing is clipped, no dev UI is visible, light theme.
8. Collect the real creative image files from this session (all options, a spread of formats, the redesign, the German version, the second campaign) into `…/kleber-content-ai-studio/assets/creatives-final/` with a small `manifest.json` (file, campaign, option, platform/format, language). The title and end card will use them.

DELIVERABLE
- Takes in `…/kleber-content-ai-studio/takes/<take-name>/` and the take scripts in `videos/walkthrough-v2/recorder/takes/`.
- `…/takes/INDEX.md`: for each take, what happens in order with the labels and their times, the agent-wait ranges with the true durations and the app's own "Worked for N s" text, the truth-check results, and anything that deviates from the plan's story. The storyboard will be written from this file alone, so it must be complete.
- Final report to me, short and plain: takes accepted, deviations from the story, turn count, what is unverified. State failures plainly; do not describe an unverified step as done.

### 2026-11-06 12:11 UTC

Steer on the editor's dot-lag finding (dot trailing the logged curve by 28-44 ms on fast moves; take.json showing ~23 delivered fps on the sample): do not spend long on it. My reading is that the low average is the static stretches of the sample page, and the lag is ordinary input-to-paint latency of one to three frames with jitter. With no dot in real takes the only effect is a hover state trailing the drawn pointer by a couple of frames, which is acceptable. Two cheap things only: (1) if a quick check shows the screencast really delivers fewer than about 50 unique frames per second while the dot is moving, tell me, because that would contradict the capture test; (2) in each real take's take.json, report unique frames per second measured inside stretches where the app is animating (entrance animations, streaming text), not the whole-take average. Then carry on with rehearsals and takes as instructed.

### 2026-11-06 13:20 UTC

Decisions on your two findings, plus one retake request for take 4.

1. Frame gaps at re-layout moments: accepted as you propose. List every gap over 100 ms outside agent waits in INDEX.md with start and end time on the master clock, and say what is on screen and whether the pointer is at rest. The editor will excise those frozen stretches where the pointer is still (typing), so they will not show.
2. Sync with three flashes per end and medians: accepted.
3. Take 4 needs redoing. The typed prompt says "photo on top, text in a red block underneath" and the reveal on camera shows the 1:1 with the red block beside the photo. A stakeholder reading the prompt and then the result will see a mismatch, and re-prompting a design is one of the features this film exists to show. Fix: have the 4:5 feed format selected and visible when the prompt is sent and when the result lands (either end take 3 on the 4:5 chip or open take 4 by clicking it, whichever is cleaner), keep the prompt wording, and accept the take only if the visible creative really is photo on top with the red block underneath. If the agent does not produce that on the visible format, retry once with the wording "Try a new design: put the text in a solid red block." and show whichever format looks best. Limit: 3 extra agent turns for this; if it still does not match, keep the best attempt and tell me. Restore to the state before take 4 (redo take 3 too if you have no checkpoint there, and add a checkpoint after take 3 this time), then redo everything downstream of it that you have already recorded.

Carry on with the rest as planned.

### 2026-11-06 13:37 UTC

Approved: re-record all takes with full Chromium new-headless at 2x once it passes the capture test (frame size, red patch, unique fps, sync). Use GPU rendering honestly: if the red patch or text rendering differs from the shell (colour management, font smoothing), report the measured difference. Carry the take 4 fix into the re-record (4:5 format visible when the redesign prompt is sent and when the result lands; accept only if the visible creative matches the prompt), and keep the checkpoint after take 3. Delete raw frames of each take once its master verifies, and delete the method (a) takes as soon as their (b) replacements are accepted; check free disk before each take.

### 2026-11-06 13:57 UTC

From the user: no time for testing, start capturing now. Skip the separate capture re-test for new-headless and go straight to recording takes 1-9 with it. Rely on the checks already built into each take's finish (frame size, sync) and look at one still from take 1 to confirm the picture is right (2880x1620, Kleber red looks right, text crisp). Keep retakes to what is truly needed: a wrong result on screen or a failed sync. Do not redo a take for isolated short stalls; list them in INDEX.md for the editor to excise. Move fast and report when all takes and INDEX.md are done.

### 2026-11-06 14:00 UTC

HOLD before recording any further take. The user has just updated the app's code (nicer shimmer loaders) and wants that in the capture. The studio clone is being re-synced and rebuilt now, which is CPU-heavy and changes the web app. Finish or abort whatever take is running, discard any new-headless take recorded so far, leave the stack as it is, and wait for my message that the rebuilt app is up. Use the wait to get take scripts ready so recording starts the moment I say go. When you resume: restore CP0 and record takes 1-9 in one session as instructed, and check your selectors against the new loaders (the turn detection must still work if loader markup changed).

### 2026-11-06 14:01 UTC

GO. The studio web is rebuilt with the user's latest fix (commit 9094d0a: the poster overlay now clears when the agent moves on to a new brief or a question) and is up on :3011; core on :8797 is unchanged, checkpoints untouched. The shimmer loaders were already in the build you rehearsed on, so expect the same UI apart from that overlay fix. Restore CP0 and record takes 1-9 now with new-headless at 2x, no separate capture test, as in my earlier message: built-in checks only, one still from take 1, retakes only for a wrong result on screen or failed sync, take 4 with the 4:5 format visible. Make sure the shimmer loaders are clearly on screen while the agent works (they are part of what the user wants shown), and mark the loader area. Report when all takes and INDEX.md are done.

### 2026-11-06 14:07 UTC

Takes accepted, including the looser gap rule. One patch take is needed, with no agent turn, to fix deviations 1 and 2 in one go. Do it now, quickly.

Patch take `take-5a-expand` (replaces the first part of take 5, up to but not including the German prompt):
1. Checkpoint the current end state first (name it CPfinal) so nothing is lost, then restore CP3 (the state right after take 4) and sign the browser back in from your saved storage state.
2. Record, same capture settings, same pacing and mark rules as before:
   a. Open on the campaign as take 4 left it (1:1 visible). Click the 4:5 feed chip so the side-by-side redesign (text on the left in a red block, photo on the right) is on screen; hold 2.5 s; mark the creative. Click Story 9:16, hold 1.2 s, then back to 1:1. This is the visible proof that the redesign did what the prompt asked.
   b. Add the five platforms exactly as in take 5 (LinkedIn, Facebook, TikTok, Display ads, Newsletter), then the same format tour.
   c. Language menu: Deutsch, Français, Magyar, back to English, about 1.5 s on each. Scroll the menu so Magyar is in view before clicking it; confirm from the page (document lang or a known label) that each switch really happened before moving on.
   d. End there, on the English UI with six platforms, which is the state take 5's German prompt starts from. Check that the screen at the end of 5a matches the screen in take 5 just before the German prompt is typed (same option, platform and format selected); if take 5 had something else selected there, end 5a on that.
3. Truth checks: the 4:5 really shows side-by-side; all five platforms rendered; each locale switched. Then restore CPfinal and leave the stack up.
4. Add 5a to INDEX.md with labels, times and gaps, and state at which master time in take 5 the editor should pick up (the first frame that matches 5a's end state before the German prompt).
5. As soon as 5a is accepted, message the editor directly: "recording is finished, you may cut and render", with the path and the take 5 pick-up time. Then send me a short final note. You can delete `takes/_methodA` and checkpoint R1.

### 2026-11-06 14:11 UTC

Clarification, since my messages crossed with your work: I see the 14:43-15:02 pass was recorded on the old web build (and partly while the rebuild ran), and that you are now re-recording takes 1-9 on the rebuilt app. That is correct and it supersedes the patch take 5a: do not record 5a. Instead fold the fixes into this pass:

- Take 4 (redesign): look at what option 1 is first, then ask for something visibly different from it in one plain sentence (as you did before). The result that matches the prompt must be seen on camera in take 4 itself: if the match is on a different format from the one showing, click that format chip right after the reveal, hold 2.5 s and mark the creative. Accept only if a viewer who read the prompt sees it fulfilled.
- Take 5 (languages): scroll the language menu so Magyar is in view, click Deutsch, Français, Magyar, English with about 1.5 s on each, and confirm each switch from the page before moving on.
- Take 8 (second campaign): after the three options land and the 2 s hold, click the option that is the cleanest proof (dealer logo first with divider, pill button, sign-off line in the post text; logos present and not colliding with the photo) and mark the three proofs there. Take 9 exports that option.
- Shimmer loaders clearly on screen and marked during each agent wait.

Same acceptance as before (sync within a frame; short re-layout stalls listed, not retaken). Rewrite INDEX.md and the creatives folder for this pass. When all takes are accepted, message the editor directly "recording is finished, you may cut and render" with the INDEX path, then send me the final note with deviations. Delete `_discardB`, `_methodA` and checkpoint R1 once the new pass is accepted.

### 2026-11-06 15:05 UTC

One short pickup take is needed, no agent turn. In take 5's format tour the Display ads tab only ever shows grey skeleton placeholders (its images had not finished loading when the tour moved on), so the film cannot show that platform's formats, and the client asked to see every post type per platform.

Do this now, quickly (the editor will start a render soon; try to finish recording before then, and tell me if frame gaps suggest it overlapped):
1. Checkpoint the current state if it is not already saved, restore CP3 (after the redesign, before platforms), sign back in from saved storage state.
2. Off camera or on, add the five platforms as in take 5 so the state matches the tour. Then record `take-5b-display-tour`: starting from the same screen take 5's tour is on just before it clicks Display ads (same option, English UI, six tabs), click the Display ads tab, wait until every image for the visible format has really loaded (check the image elements are complete, not skeletons; allow up to 30 s and log how long it took), hold 1.2 s, then click each Display ads format chip in turn, each time waiting for the image to be loaded and holding 0.8 s. Then do the same for Newsletter, and for any other platform where take 5's tour moved on before the image had loaded (check take 5's stills or your notes; if all others were fine, skip them). Same marks as the tour: tab row, each tab, chip row, each chip, the creative.
3. If the Display ads images never load within 30 s, stop and report that plainly with what the network shows for those image requests; that would be an app fault and the film will leave the platform out.
4. Restore the previous end state afterwards, add the take to INDEX.md (labels, times, load waits as wait ranges, gaps), and message the editor directly with the path and a one-line description. Then a two-line note to me.

### 2026-11-06 16:37 UTC

Full retake. The owner had eight app issues fixed (commit 686fc52, pushed); the studio clone is rebuilt from it, up on :3011 / :8797 and restored to CP0 with the sign-in link unused. Re-record takes 1-9 from CP0 in one browser session, same capture method (new-headless, 2x, 60 fps), same acceptance rules, and overwrite checkpoints CP1-CP7 as you go. Budget: up to 12 more agent turns (23 used so far). Nothing heavy is running on the Mac; the editor is idle until you finish.

What changed in the app (adapt selectors and flows; check each on a first dry look before recording):
- Onboarding: step 1 still "Continue"; it now shows "Step 1 of 2" / "Step 2 of 2" with company, name and email in one card. The logo step is a drop zone: a button whose accessible name starts with "Upload your logo", hidden file input (setInputFiles still works), states empty / uploading / uploaded with dark and light previews plus Change / Remove. "Skip for now" disappears once a logo is saved; "Create your first post" stays.
- On-image edit chips are now small, translucent, and shown only for the field under the pointer; hovering the image outlines every editable field. Accessible names: "Edit the headline on the image" and "Edit the call to action on the image". The side panel's "Button" field is now "Call to action".
- Account menu: "Settings" has an icon. Settings page (`/company`): a back button at the top (role link, name "Back to the app"); the old link at the bottom is gone. The brand-kit preview card is now a square creative.
- Creatives: the dealer logo is now as tall as the Kleber mark and sits on a white label where it would not read (for example on Kleber red, one joined "SUMMIT | Kleber" label); packshot tyres are large; the 4:1 newsletter banner is side by side; no creative can ship without logos.

Keep the story, pacing rules, marks and truth checks exactly as in the last pass, and keep every label name identical to the last pass wherever the action is the same (the storyboard is keyed on them). Fold in what the edit taught us:
1. Hover hygiene: whenever the pointer rests for more than about half a second, park the real mouse somewhere that triggers no hover state: never on a creative (it now outlines every editable field), never on a logo preview tile, never on a chip. The only time the mouse is over a creative is the on-image headline edit itself. This applies to every reveal and every hold.
2. Take 1: after the upload, move straight off the preview tiles to neutral space; mark the drop zone, the uploaded state and both preview tiles.
3. Take 3: frame-friendly order: options 2, 3, 1, then format chips 4:5, Story 9:16, back to 1:1, each with its hold, then the post-text edit and the on-image headline edit.
4. Take 5: the format tour must show every format of all six platforms with the creative actually in view: for Display ads and Newsletter scroll the preview so the ad or banner is visible before each hold (as in your 5b pickup), so no pickup take is needed. Language menu as last time, scrolling to Magyar.
5. Take 7: scroll so the brand-kit controls and the preview card are in view together while clicking Kleber red, Pill, Our logo first, With a divider, with a 1.2 s hold after each so the preview's change can be seen; mark the preview card after each change. After the memory section, scroll back up and click the new "Back to the app" button to return (mark it).
6. Take 8 and 9: when the three options of the second campaign land, hold 2 s with the mouse parked off the creative, then click the option that shows the proofs best, and mark the three proofs before any scrolling (lockup with the dealer logo first, the pill button, then scroll once to the sign-off line and mark it there). With the logo fix the "our logo first" proof should now be clearly visible; say in INDEX.md which option you chose and why.
7. Before clicking a download or copy control in the export sheet, wait an extra 0.4 s after the sheet has settled so the capture stall there does not land on a pointer move.

Deliverables as before: takes, a fresh INDEX.md (labels, times, waits with true durations and the app's "Worked for N s" text, gaps, truth checks, deviations), and `assets/creatives-final/` regenerated from this pass with its manifest. When all takes are accepted, message the editor directly "retake finished, you may cut and render" with the INDEX path and a list of any label that changed name, then send me a short final note.

### 2026-11-06 16:41 UTC

Heads-up: while your retake was under way, the fix agent pushed a small follow-up (commit 70c84f2: the 4:1 newsletter banner now sets long headlines on up to three lines and centres the type; renderer only) and restarted the studio core with it. It says the stack is up, but it did not know you were recording, and it mentions CP0.

Check now: (1) whether the core restart or any restore hit a take in progress or changed the database state under you (compare what the app shows with your last checkpoint); if a take was disturbed, roll back to your last good checkpoint and redo from there; (2) that the core you are recording against is the restarted one, so the newsletter banners in take 5 (including the German one) come from the new banner code. Takes recorded before the restart that do not show a newsletter banner are fine as they are. Tell me in one line what you found, then carry on. Nobody else will touch the studio from here.

### 2026-11-06 18:44 UTC

One retake, no agent turn: take 7 (settings). The owner watched both films and the settings scene is the one thing wrong: when the brand-kit controls are clicked, the control being clicked sits at or above the top edge of the frame (screenshots: `~/Library/Application Support/CleanShot/media/media_YAgoLTKeDY/CleanShot 2026-11-06 at 19.37.41@2x.png` and `…/media_QIpqtTH0zZ/CleanShot 2026-11-06 at 19.39.15@2x.png`), and the bottom of the preview card, where its button is, is cut off by the viewport. Part of that is camera framing, which the editor will fix, but the footage must make a good framing possible.

Do this now:
1. Restore CP5 (state after the rule take), sign in from saved storage state, and re-record `take-7-settings` with the same labels as before. Takes 8 and 9 stay as they are, so the brand kit must be saved with exactly the same values as last time (Kleber red, Pill, Our logo first, With a divider) and the take must end the same way (memory section, then the "Back to the app" button). Overwrite CP6 afterwards and leave the stack on the latest end state you have (restore it if needed).
2. Scroll positions, measured from the page, not guessed. Before each click, the clicked control's whole row and the whole preview card (top edge to bottom edge, including the button inside the creative) must both be inside the 1440x810 viewport with at least 24 px of margin above the row and below the card. If one scroll position cannot hold the Colours row and the whole card together, use two: one for the colour click that shows the Colours row and as much of the card as fits while keeping the row fully visible with its label, then scroll so the Button row is near the top and the whole card is visible for the Pill, logo-order and divider clicks. Log the scroll as a `scroll` event and never scroll while a click is pending. After each click hold 1.2 s with the mouse parked off every hover target, and mark: the clicked control, its row, and the preview card (re-mark the card after each change).
3. Memory section: when the pointer rests there, do not rest on a delete icon (last time its hover box showed during the spotlight); point near the notes without hovering a control, and mark the notes list and one note.
4. Keep every other rule from the last pass (pacing, sync, hover hygiene, truth check that the saved kit reads back as before).

Then update INDEX.md for take 7 (times, scroll positions used, gaps) and message the editor directly: "take 7 retaken, you may cut", with any label that changed. A two-line note to me when done.
