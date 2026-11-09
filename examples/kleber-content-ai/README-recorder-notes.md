# Kleber Content AI: recorder notes

The walkthrough this toolkit was extracted from: nine takes (about ten minutes of raw footage) telling the story of a tyre dealer using Kleber Content AI, a chat-driven ad-creative studio (Next.js web app + Node API server, PGlite database, render cache on disk). Recorded 2026-11-06 against a studio instance built from the app's commit `686fc52`.

These files are the project side of the recorder interface. They are a worked example, not something to run as is: they need that app, its studio instance and a fresh one-time sign-in link.

| File | What it shows |
|---|---|
| `walkthrough.config.mjs` | the project config: base URL of the studio web build (:3011), takes in the studio folder, the rest guard for `.edge-fade-x` rows, clipboard permissions, the studio section for checkpoints, `project` paths for the sign-in link file and the logo |
| `app.mjs` | the adapter. Hooks: `init` (live `APP`, `LINK_FILE`, `LOGO_FILE` bindings), `setupSession` (clipboard), `forbiddenKeys` (Enter, Escape), `parkPoint` (preview pane gutter, else page margin). App helpers: structural selectors (`SEL`), `sendChat` / `waitForTurn` (POST `/api/chat` + Send back or question panel; outcome from DOM structure), `watchTurn` (marks the status line and shimmer loaders while the agent works), `uploadLogo` (file chooser), `optionCardButton`, `cardBox`, truth helpers over the app's API (`campaigns`, `downloadKit`) |
| `scenes.mjs` | the nine takes (`SCENES`), each with `pre`, `run`, `truth` and the checkpoint it leads to |
| `take-5b.mjs` | a standalone pickup take: loads the config and adapter itself, sets the screen up off camera, records one take, writes `truth.json` |
| `selftest-app.mjs` | the adapter against a local mock of the composer and `/api/chat` (no server). Proves helper logic only |
| `studio.config.sh` | the studio: core (`pnpm --filter @kleber/server start`, :8797, holds the data) and web (Next standalone server, :3011, stateless, with a `prepare_web` step); PGlite and render cache as checkpointed data; telemetry and tracing exporters blanked |

Values that were secret are not here. `link.txt` (the dealer's one-time sign-in link, made by the provisioning step at CP0) is referenced by path only; `TELEMETRY_TOKEN` is set to empty, as in the original; no `.env` was copied.

## Running it

```
export STUDIO_CONFIG=examples/kleber-content-ai/studio.config.sh
studio/bin/status.sh
studio/bin/restore.sh CP0          # clean dealer, sign-in link unused (write a fresh link.txt first)
node recorder/takes/run.mjs --config examples/kleber-content-ai/walkthrough.config.mjs
# after each take: read takes/_runner/status-N.json and the take's verify/sheet.jpg, then write go-N.json
node recorder/takes/run.mjs --config examples/kleber-content-ai/walkthrough.config.mjs 8 9   # resume later
node examples/kleber-content-ai/take-5b.mjs <studio>/checkpoints/CP3/storage.json             # pickup take
node recorder/takes/index-data.mjs --takes <studio>/takes > per-take.md                       # INDEX.md sections
```

`KLEBER_STUDIO` and `KLEBER_SOURCE` override the studio and source paths.

## Takes and checkpoints

| # | Take | Story | Checkpoint after | Database state at that checkpoint |
|---|---|---|---|---|
| — | — | provisioning (off camera) | CP0 | dealer provisioned, sign-in link unused |
| 1 | `take-1-signin` | sign-in link, confirm company, upload logo, start screen | CP1 | signed in, logo uploaded |
| 2 | `take-2-campaign` | first prompt, agent turn, three options appear | CP2 | first campaign, 3 options |
| 3 | `take-3-choose` | pick an option, format tour, edit post text and the headline on the image | CP2b | edits made |
| 4 | `take-4-redesign` | "Try a new design" turn | CP3 | redesign |
| 5 | `take-5-platforms-german` | add platforms, format tour, German version, UI language | CP4 | 6 platforms, German option 2 |
| 6 | `take-6-rule` | "From now on, always end our posts with ..." (memory notes) | CP5 | 2 memory notes |
| 7 | `take-7-settings` | settings: brand kit, assistant memory, back to the app | CP6 | brand kit saved |
| 8 | `take-8-second-campaign` | second campaign; the rule shows up in the new posts | CP7 | second campaign |
| 9 | `take-9-export` | export sheet, download kit and image, copy text | — | (end state) |
| 5b | `take-5b-display-tour` | pickup: Display ads and Newsletter format tour with every creative loaded | — | run on CP3 |

Each checkpoint folder holds `pglite/`, `render-cache/` (APFS clones), `storage.json` (the browser's cookies, so a redo or a pickup starts signed in) and `ctx.json` (campaign ids and results that later takes read).

## What the recording showed

- All nine takes passed the sync check (both flash-group medians within 1 frame in the decoded master). One earlier attempt at take 6 failed it (a start flash 3 frames late) and was retaken.
- 29 agent turns in total over all passes, 6 in the final pass; every one ended `success` and left the app in pointer mode (typing with `insertText`, Send clicked).
- Seven of the nine kept takes have a capture stall over 100 ms outside agent waits (longest per take 133-259 ms): the dock composer growing a line while typing, a 9:16 preview mounting, an edited creative re-rendering, the UI language switching, the export sheet closing. They were listed per take in `takes/INDEX.md` instead of being retaken; the runner's `ok` flag was false for those takes, and the reviewer accepted them.
- Inside agent waits, gaps of about 250 ms recurred every ~2.4 s, matching the poster-sheen loader's cycle (cause not proven). Those ranges are time-lapsed in the film.
- Take 7 was redone after a scripting error (memory notes below the fold, fixed with `take.reveal`). The restart reloaded the page, so a line in take 6's reply reads differently in take 7.
- The chip-row rest guard never had to act on the real app; the `question` / `inline-question` / `error` turn outcomes never occurred and were checked only against the mock.
- Off-camera helpers used while preparing the scenes (screenshots of onboarding and hover states with a checkpoint's `storage.json`) became `recorder/tools/inspect.mjs`.
