---
name: record-takes
description: Record cursor-free, action-logged takes of any web app or website for a walkthrough or tour film - studio mode (isolated clone of an owned app with checkpoints) or site mode (any URL with saved login, consent-banner dismissal and generic waitQuiet), viewport presets (desktop or phone), capture test, adapter and scene scripts, rehearsals, one browser session per pass, read-back, retakes, and takes/INDEX.md. Use for the recording phase, for retakes and pickup takes after review notes, and when the app changed and the film must be re-recorded.
---

# Record takes

The take operator (`agents/take-operator.md`, Opus) does this work; the studio builder
(`agents/studio-builder.md`, Sonnet) sets up and re-syncs the instance. You (the lead) brief them, accept the
capture method, and gate on truth checks.

Read: `docs/CONTRACT.md` (take format `walkthrough-take/1`), `docs/CAPTURE_TEST.md`, `studio/README.md`,
`docs/LESSONS.md` (section "Capture and recording"). Example project files:
`examples/brightpost/{walkthrough.config.mjs,app.mjs,scenes.mjs,studio.config.sh}`.

## Inputs

- The approved plan (story table, takes and checkpoints table, rehearsal list).
- A project folder holding `walkthrough.config.mjs` (base URL, viewport 1440x810, scale 2, fps, takes dir,
  adapter, scenes, studio config), `app.mjs` (the app adapter: sign-in, send a message, wait for an agent turn,
  upload, app-specific waits) and `scenes.mjs` (one entry per take: steps, marks, checkpoint after).
- `studio.config.sh` for the instance (source path, studio root, data dirs to checkpoint, services, ports,
  build command, env).

## Site mode (any URL, no studio)

- Config (`walkthrough.config.mjs`): `baseUrl`; `viewport: "desktop"` (1440x810 @2) or `"phone"` (390x844 @3
  with mobile emulation) or `{width, height}`; the takes folder; a storage-state file (`--storage` /
  `WALKTHROUGH_STORAGE`, git-ignored); `dismiss: [selectors]` for consent/cookie banners; `blockUrls:
  [patterns]` for chat widgets, trackers or ads; `safeArea: { top, bottom: 120, on: ["click", "mark"] }` so
  targets are kept clear of the caption band. Full reference: `recorder/README.md`, `docs/CONTRACT.md`.
- Scenes can be a `.json` file of declarative `steps` (no adapter, no code) for a website; use a JS scenes
  module only when a step needs logic.
- Start from the working site-mode project in `recorder/site-test/` (`walkthrough.config.mjs` + `scenes.json`;
  `npm run site-test` in `recorder/` proves it end to end): copy both into the user's project and change
  `baseUrl`, `dismiss`, `blockUrls` and the steps. `takesDir` resolves next to the config, so the takes land in
  the project, not in the kit.
- Look first without recording: `node recorder/tools/inspect.mjs --config <config> --path /page`.
- Log in once with a **test account** outside any take and save the storage state; every take reuses it:
  `node recorder/tools/save-login.mjs --url <sign-in page> --until <URL part after sign-in> --out <project>/login.storage.json`
  (the owner types the password in the visible browser; never you). A public site with no login skips this.
- Scenes use generic waits (`take.waitQuiet(label, { network, dom, ms, timeout })`: network idle and no DOM
  mutations for a settle window; also exported from `recorder/takes/lib.mjs`) instead of
  app-specific turn detection, `take.scrollIntoViewSafe(target, { marginTop, marginBottom, label })` before acting near a viewport edge, and `mark` on every
  element a caption or line will talk about (the mark records its visible text for the caption audit).
- No checkpoints: keep scenes idempotent (tours, navigation, reversible settings), or reset state by hand
  between takes and note it in INDEX.md. Never submit real orders, payments, messages or public posts.
- Skip the studio steps below; everything else (capture test, rehearsal, read-back, truth checks, INDEX.md)
  applies unchanged.

## Steps (studio mode; site mode skips the first two)

- [ ] **Studio.** Write `studio.config.sh` from `studio/studio.config.example.sh` (keys: `STUDIO_ROOT`,
  `STUDIO_SOURCE`, `STUDIO_DATA=("name:/path" ...)`, `STUDIO_SERVICES`, `STUDIO_TREE_REMOVE`, `STUDIO_BUILD`,
  per service `<svc>_cmd/_dir/_env/_port/_health/_wait/_holds_data/_prepare`). `studio/bin/tree.sh --build`
  makes the clone; `STUDIO_CONFIG=<project>/studio.config.sh studio/bin/up.sh`; `status.sh`; then
  `checkpoint.sh CP0` right after the demo account and one-time link exist. Confirm the owner's ports are
  untouched and the web is a production build (no dev indicator in the HTML).
- [ ] **Sync before recording.** Diff the app repo against the clone's sources; if they differ, re-sync and
  rebuild (`studio/bin/tree.sh --build` per `studio/README.md`), restart, and only then record.
- [ ] **Capture test** (once per machine or browser change), from the kit root:
  `npm run setup` (recorder dependencies and Playwright Chromium), then
  `node recorder/capture-test.mjs new 2 idle 30` (method `new|shell|headed`, scale, phase `idle|load|drift`,
  seconds) and the `load` and `drift` phases. Accept the first method
  that passes the table in `docs/CAPTURE_TEST.md`; new-headless with GPU is the expected winner. Record the
  numbers. Also `node recorder/sample-take.mjs` and `node recorder/verify-dot.mjs takes/sample` for pointer
  sync if the editor needs a sample.
- [ ] **Adapter.** Site mode: start from `waitQuiet` and the generic helpers and add app-specific code only
  where a step needs it. Studio mode: write or adapt `app.mjs` from the app's code: real selectors (role/name), turn detection
  from the network (request finished + submit button back), result classification (success / question /
  error), a file-chooser upload, send-by-click (never Enter), no Escape during turns. `recorder/tools/explore.mjs`
  and `inspect.mjs` help map the UI.
- [ ] **Rehearse** each agent turn on a throwaway restore. Record what the app does and how long it takes;
  change the storyboard or the prompt wording before the real pass, not after.
- [ ] **Record the pass** in one browser session in story order:
  `node recorder/takes/run.mjs --config <project>/walkthrough.config.mjs [scene ...] [--from N --to N] [--auto]`.
  The runner pauses after each take and writes `status-N.json` and a contact sheet; read them, then write
  `<takesDir>/_runner/go-N.json` = `{"action": "next" | "redo" | "stop", "checkpoint"?, "restore"?}`.
  Flags (and env): `--base-url` (`WALKTHROUGH_BASE_URL`), `--takes` (`WALKTHROUGH_TAKES`), `--storage`
  (`WALKTHROUGH_STORAGE`), `--mode new|shell|headed` (`WALKTHROUGH_MODE`), `--studio-config` (`STUDIO_CONFIG`),
  `--fresh`. Checkpoint after each take later takes depend on.
- [ ] **Read back each take**: sync passed (logged times within one frame of the decoded flashes), unique fps
  inside animating stretches, gaps over 100 ms listed, and the truth checks: the result on screen matches the
  prompt on the visible format; images loaded (scroll below-the-fold previews into view); every counted item
  seen; the clicked control and the thing that changes both inside the viewport.
- [ ] **Retake** from the take's checkpoint only for a wrong result on screen or a failed sync. A pickup take
  (no agent turn) can replace a short stretch; prefer folding the fix into the next full pass.
- [ ] **INDEX.md**: `node recorder/takes/index-data.mjs --takes <dir>` plus the operator's notes:
  labels and times, waits and outcomes, gaps with what is on screen, truth checks, deviations, turns used.
- [ ] Announce "recording finished" to the editor. Delete raw frames of verified takes and rejected takes.

## Verification

`take.json` of every take shows sync passed and frame size 2880x1620; INDEX.md truth checks are all "yes";
the studio stack is up on the last checkpoint; the owner's servers still run with the same pids.

## Outputs

`<takes dir>/<take>/{master.mp4,events.json,take.json,verify/}`, `<takes dir>/INDEX.md`, checkpoints
`CP0..CPn`, saved browser storage state.

## Pitfalls

- Headless shell looked fine on a synthetic page and fell to 10-14 fps on the real app (C1).
- Recording on a stale build (C2), or while anything heavy runs (C3).
- Someone else restarting the studio core mid-take (C4): verify state, redo from the checkpoint.
- Redesign result shown on the wrong format (C5); skeletons below the fold (C6); keyboard mode (C7).
- The one-time link is consumed on first use; restoring CP0 makes it unused again (C13). Never print it.
- Each agent turn costs money; keep to the budget and report turns used.
