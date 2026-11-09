---
name: record-takes
description: Record cursor-free, action-logged takes of any web app or website for a walkthrough or tour film - studio mode (isolated clone of an owned app with checkpoints) or site mode (any URL with saved login, consent-banner dismissal and generic waitQuiet), a tour map of the site first (walkthrough explore, drafted scenes), viewport presets (desktop or phone, for 9:16 films), new-tab, download and dialog policies, capture test, adapter and scene scripts, rehearsals, one browser session per pass or parallel takes in site mode (walkthrough take), read-back, retakes, and takes/INDEX.md. Use for the recording phase, for retakes and pickup takes after review notes, and when the app changed and the film must be re-recorded.
---

# Record takes

The take operator (`agents/take-operator.md`, Opus) does this work; the studio builder
(`agents/studio-builder.md`, Sonnet) sets up and re-syncs the instance. You (the lead) brief them, accept the
capture method, and gate on truth checks. (Or, without sub-agents, do those roles' checklists yourself: see
`agents/take-operator.md` and `agents/studio-builder.md` in the kit.)

Read: `docs/CONTRACT.md` (take format `walkthrough-take/1`, incl. the `download` and `dialog` events),
`docs/CAPTURE_TEST.md`, `recorder/README.md` (config, tour map, take runner), `studio/README.md`,
`docs/LESSONS.md` (section "Capture and recording"), `docs/CLI.md` (`explore`, `take`). Example project files:
`examples/brightpost/{walkthrough.config.mjs,app.mjs,scenes.mjs,studio.config.sh}`.

**Where the kit is.** `KIT` is the walkthrough-studio checkout; kit paths (`recorder/`, `film/`, `docs/`,
`agents/`, ...) are relative to it. Use the first of these that holds `recorder/` and `film/`:
`${CLAUDE_PLUGIN_ROOT}` (Claude Code or Codex plugin install; skip it if it shows unexpanded),
`$WALKTHROUGH_STUDIO_HOME`, `~/walkthrough-studio`, this skill's own `../..`. If none does, the install copied
only this file (skills.sh): ask the user to run
`git clone https://github.com/gabros20/walkthrough-studio ~/walkthrough-studio && cd ~/walkthrough-studio && npm run setup`.
Without sub-agents (most platforms other than Claude Code), do each named agent's role yourself from
`$KIT/agents/<name>.md`.

## Inputs

- The approved plan (story table, takes and checkpoints table, rehearsal list).
- A project folder (`walkthrough init <dir> --mode site|studio --url <baseUrl>` makes one) holding
  `walkthrough.config.mjs` (base URL, viewport preset, fps, takes dir, adapter, scenes, `popups`, `dialogs`,
  studio config), `scenes.json` (declarative steps) or `scenes.mjs` (one entry per take: steps, marks,
  checkpoint after) and, for an app with agent turns or uploads, `app.mjs` (the adapter: sign-in, send a
  message, wait for an agent turn, upload, app-specific waits).
- Studio mode: `studio.config.sh` for the instance (source path, studio root, data dirs to checkpoint,
  services, ports, build command, env).

With the CLI every step below has a short form that prints the command it runs and records the result in
`state.json`: `walkthrough explore`, `walkthrough capture-test`, `walkthrough studio up|checkpoint|restore`,
`walkthrough take [scene…] [--auto] [--parallel N]` (each take's ok, accepted, sync, gaps and checkpoint go
into `state.takes`). The direct `node recorder/…` commands are the fallback and take the same flags.

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
- **Map the site first** (read-only): `walkthrough explore [url] [--depth 2] [--max-pages 20]` (or
  `node recorder/tools/explore.mjs <url> --config <config> --out <project>`). A same-site breadth-first crawl,
  one page at a time, robots.txt honoured; it never clicks, types or submits, and skips download, mail,
  sign-out and destructive links. It writes `tour-map.json` / `tour-map.md` (per page: landmarks, h1-h3, up
  to 80 controls with role, name, text and box), `thumbs/` and `scenes.draft.json` (one scene per page:
  `nav`, `wait quiet`, the h1 marked as `headline`, up to 5 clicks; destructive, consent and submit controls
  listed under `_skipped`, never clicked). Edit the draft into `scenes.json`: cut, reorder, add typing and
  scrolls, start each scene off camera. It follows links only: dialogs, tabs and client-side routes without
  links are not mapped.
- Look at one page without recording: `node recorder/tools/inspect.mjs --config <config> --path /page`.
- Log in once with a **test account** outside any take and save the storage state; every take reuses it:
  `node recorder/tools/save-login.mjs --url <sign-in page> --until <URL part after sign-in> --out <project>/login.storage.json`
  (the owner types the password in the visible browser; never you). A public site with no login skips this.
- Scenes use generic waits (`take.waitQuiet(label, { network, dom, ms, timeout })`: network idle and no DOM
  mutations for a settle window; also exported from `recorder/takes/lib.mjs`) instead of
  app-specific turn detection, `take.scrollIntoViewSafe(target, { marginTop, marginBottom, label })` before acting near a viewport edge, and `mark` on every
  element a caption or line will talk about (the mark records its visible text for the caption audit).
- No checkpoints: keep scenes idempotent (tours, navigation, reversible settings), or reset state by hand
  between takes and note it in INDEX.md. Never submit real orders, payments, messages or public posts.
- **Phone takes** (`viewport: "phone"`, 390x844 @3, 1170x2532 master, touch and mobile user agent): needed
  for a 9:16 film; the film draws a neutral device bezel around them. Every take in one film shares one
  viewport, so decide before the first take.
- **New tabs, downloads, dialogs** (config or `--popups` / `--dialogs`): `popups: "same-tab"` (default:
  `target=_blank` and `window.open` navigate the same page, logged as a `nav` with `popup: "same-tab"`),
  `"follow"` (the screencast moves to the new tab: a hard cut on one clock, `nav` with `newTab: true`; the
  old frame holds until the new page paints) or `"block"` (closed at once, `popup: "blocked"`). Downloads
  are saved to `<take>/downloads/` and logged as `download` events with the causing step's label, so a
  caption on that click can claim the file. `dialogs: "accept"` (default) or `"dismiss"` answers alert,
  confirm, prompt and beforeunload at once, logged as `dialog` events; headless Chromium draws no dialog box,
  so the footage shows none.
- **Parallel takes** (site mode only): `walkthrough take --parallel N` (runner `--parallel N`) records
  independent scenes N at a time, each in its own browser and take folder from a fresh page, `--auto`
  implied. Refused with a `studio` in the config (one database, one clock). It starts no servers (all takes
  use `baseUrl`), and two 2880x1620 screencasts load the machine: expect longer capture gaps, raise
  `gate.maxGapMs` or record in sequence when takes fail on gaps. Scenes must not depend on each other.
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
- [ ] **Capture test** (once per machine or browser change): `npm run setup` in the kit (recorder
  dependencies and Playwright Chromium), then `walkthrough capture-test` (or
  `node recorder/capture-test.mjs new 2 idle 30`: method `new|shell|headed`, scale, phase `idle|load|drift`,
  seconds) and the `load` and `drift` phases; `walkthrough doctor --capture` runs an 8 s check. Accept the first method
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
- [ ] **Record the pass** in one browser session in story order: `walkthrough take [scene ...] [--from N
  --to N] [--auto]` (or `node recorder/takes/run.mjs --config <project>/walkthrough.config.mjs …`).
  The runner pauses after each take and writes `status-N.json` and a contact sheet; read them, then write
  `<takesDir>/_runner/go-N.json` = `{"action": "next" | "redo" | "stop", "checkpoint"?, "restore"?}`.
  Flags (and env): `--base-url` (`WALKTHROUGH_BASE_URL`), `--takes` (`WALKTHROUGH_TAKES`), `--storage`
  (`WALKTHROUGH_STORAGE`), `--mode new|shell|headed` (`WALKTHROUGH_MODE`), `--studio-config` (`STUDIO_CONFIG`),
  `--fresh`, `--popups`, `--dialogs`, `--parallel N`. Checkpoint after each take later takes depend on.
- [ ] **Read back each take**: sync passed (logged times within one frame of the decoded flashes), unique fps
  inside animating stretches, gaps over 100 ms listed, and the truth checks: the result on screen matches the
  prompt on the visible format; images loaded (scroll below-the-fold previews into view); every counted item
  seen; the clicked control and the thing that changes both inside the viewport; a followed tab (`newTab`)
  painted before the scene goes on; each `download` has its file and bytes.
- [ ] **Retake** from the take's checkpoint only for a wrong result on screen or a failed sync. A pickup take
  (no agent turn) can replace a short stretch; prefer folding the fix into the next full pass.
- [ ] **INDEX.md**: `node recorder/takes/index-data.mjs --takes <dir>` plus the operator's notes:
  labels and times, waits and outcomes, gaps with what is on screen, truth checks, deviations, turns used.
- [ ] Announce "recording finished" to the editor. Delete raw frames of verified takes and rejected takes.

## Verification

`take.json` of every take shows sync passed and frame size 2880x1620 (1170x2532 for phone takes);
`walkthrough state` lists every take ok and accepted; INDEX.md truth checks are all "yes";
the studio stack is up on the last checkpoint; the owner's servers still run with the same pids.

## Outputs

`<takes dir>/<take>/{master.mp4,events.json,take.json,verify/,downloads/}`, `<takes dir>/INDEX.md`,
`tour-map.json` / `.md` and `scenes.json` when the site was mapped, checkpoints `CP0..CPn`, saved browser
storage state, `state.takes` in `state.json`.

## Pitfalls

- Headless shell looked fine on a synthetic page and fell to 10-14 fps on the real app (C1).
- Recording on a stale build (C2), or while anything heavy runs (C3).
- Someone else restarting the studio core mid-take (C4): verify state, redo from the checkpoint.
- Redesign result shown on the wrong format (C5); skeletons below the fold (C6); keyboard mode (C7).
- The one-time link is consumed on first use; restoring CP0 makes it unused again (C13). Never print it.
- Each agent turn costs money; keep to the budget and report turns used.
- Parallel takes on a busy machine: capture gaps grow; record in sequence when it matters.
- A followed tab is a hard cut; prefer `same-tab` unless the new tab is the point of the scene.
