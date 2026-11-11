# recorder

Records an app walkthrough as **takes**: cursor-free 2880x1620 / 60 fps footage of the real app (`master.mp4`) plus a log of every action on the footage's clock (`events.json`). The film build draws the pointer, camera moves and captions from the log. The take format is in [`../docs/CONTRACT.md`](../docs/CONTRACT.md); how the capture method was chosen and tested is in [`../docs/CAPTURE_TEST.md`](../docs/CAPTURE_TEST.md).

The core knows nothing about any app. A project supplies a config and scenes, and optionally an adapter (app helpers in code). Two ways to use it:

- **Site mode** (any website or app you do not run yourself): a config with `baseUrl`, optional `storageState`, `blockUrls` and `dismiss`, and scenes as a JSON list of steps. No code, no studio. See "Site mode" below and `site-test/`.
- **App mode** (an app you own, in a `../studio` sandbox): a config with a `studio` section, an adapter module and code scenes. The worked example is [`../examples/brightpost/`](../examples/brightpost/).

## Install

Needs Node 22+ (developed on 24), ffmpeg 8 with ffprobe on `PATH`, macOS or Linux.

```
cd recorder
npm install                                  # playwright-core 1.62.1, pinned
npx playwright-core install chromium         # Chromium build 1234 (~250 MB, in ~/Library/Caches/ms-playwright)
npm run sample-take                          # ~15 s take of pages/sample.html -> ../takes/sample/
node verify-dot.mjs ../takes/sample          # pointer-sync check: "pass": true
npm run site-test                            # site mode end to end (add -- --viewport phone for the phone preset)
npm run explore -- <url> --max-pages 3       # tour map of a site (see "Tour map")
```

Takes go to the config's `takesDir`, else `$WALKTHROUGH_TAKES`, else `takes/` at the repo root (git-ignored). Never inside `recorder/takes/`, which is code.

## How a take works

1. `openSession()` launches Chromium (new headless, GPU, `--force-device-scale-factor=2`), a 1440x810 light-mode context at device scale 2, and installs a small in-page script (`inpage.mjs`: cursor-shape reporting, sync flashes, optional heartbeat pixel and calibration dot). One session records many takes in a row; cookies, app state and the pointer position carry over.
2. `session.startTake(name)` first clicks away any visible `dismiss` targets (off camera), then starts the DevTools screencast (JPEG q90, every frame acknowledged at once) and shows **three 100 ms green flashes**.
3. The scene drives the page: `take.click`, `take.type`, `take.scroll`, `take.reveal`, `take.mark`, `take.wait`, `take.nav`. The real mouse follows the same quadratic arcs with the same power3.inOut ease (`motion.mjs`) that the film will draw, stepped at 60 Hz. Every action is logged with wall-clock times.
4. `take.finish()` shows three more flashes, stops capture, finds every flash in the raw frames, measures the render-and-capture latency at each end, converts all logged times to the master clock, encodes `master.mp4` (constant 60 fps, CRF 12, BT.709 with accurate swscale flags), decodes it again to check every flash lands where the log says (`masterSync.pass`), and writes `events.json` and `take.json`.

Raw frames are slotted by the browser's own timestamps (`slot = round((ts - T0) * 60)`); only the last frame per slot is kept, so memory stays flat and disk grows by at most 60 frames per second. Static stretches hold the last frame in the master.

### A take folder, and what may be removed

```
takes/<name>/
  master.mp4            the footage (kept)
  events.json           the action log on the master clock (kept; the film reads it)
  take.json             sync, gaps, warnings, the verdict (kept)
  verify/sheet.jpg      the contact sheet the runner writes (kept; small)
  downloads/            files the take downloaded (kept)
  raw/frames.bin        every captured JPEG frame at full size: usually the largest file of the take
  raw/frames.ndjson     the index into frames.bin
  raw/delivered.json    when each frame arrived (small; takes/INDEX.md and takes/report.mjs read it)
```

`raw/frames.bin` and `raw/frames.ndjson` are only needed to re-encode the master (`remux.mjs`, e.g. at
30 fps). `finish.keepRaw` decides when they go: with `false` (the config default) `take.finish()` deletes
`frames.bin` as soon as the master's sync check passes, and `walkthrough take` removes both files of every ok
take of the run; with `true` both stay until `walkthrough clean` removes them from accepted takes. Called
directly (sample and capture-test scripts), `take.finish()` keeps them unless you pass `keepRaw: false`.
Rejected takes go whole at `walkthrough clean` (not at once, so a reviewer can still look at them), and
`walkthrough clean --all` removes the whole `raw/` of every take after the film is accepted.

## Files

| File | What it does |
|---|---|
| `capture.mjs` | browser launch, screencast writer, master encode, frame decode helpers, `probe` |
| `take.mjs` | `openSession`, `Session`, `Take` (all actions and logging), `verifyMasterSync`, `SCHEMA` |
| `motion.mjs` | pointer path maths shared with the film (`film/lib/` imports it as `../../recorder/motion.mjs`; do not rename or move) |
| `rng.mjs` | seeded typing cadence |
| `inpage.mjs` | the in-page script (installed into every document) |
| `config.mjs` | loads `walkthrough.config.mjs`, applies env and flags, loads adapter and scenes |
| `index.mjs` | the public API in one import |
| `takes/run.mjs` | the take runner (below) |
| `takes/steps.mjs` | declarative scenes: `runSteps(take, steps)`, `sceneFromSteps(scene)` (site mode) |
| `takes/lib.mjs` | generic scene helpers: `markIf`, `markEach`, `park`, `clickPark`, `guardKeys`, `NetworkWatcher`, `waitForNetworkTurn`, `typeAndSend`, `uploadWithChooser`, `scrollToEnd`, `textBox`, `caretAfter`, `whilePending`, `beat`, `visibleFirst` |
| `takes/report.mjs` | contact sheet and unique-fps report for a finished take |
| `takes/index-data.mjs` | prints the per-take sections of `takes/INDEX.md` |
| `takes/add-mark.mjs` | adds a mark measured after the take (relative to another mark's box) |
| `remux.mjs` | rebuilds a master at another frame rate from the raw frames |
| `retime.mjs` | re-maps an old single-latency take onto the two-ended latency model |
| `verify-dot.mjs` | pointer-sync check on a calibration take |
| `capture-test.mjs` | the capture-quality test (`docs/CAPTURE_TEST.md`) |
| `sample-take.mjs` | records the sample take on `pages/sample.html` |
| `site-test.mjs`, `site-test/` | site-mode check: serves `pages/` locally and records the two scenes of `site-test/scenes.json` (desktop or `--viewport phone`; `--popups`, `--dialogs`, `--parallel 2` for the other policies and parallel takes) |
| `tools/inspect.mjs` | screenshot + outline of interactive elements at the take viewport, optionally signed in (no recording) |
| `tools/explore.mjs` | the tour map (below): crawl a site, write `tour-map.json`/`.md`, thumbnails and `scenes.draft.json`; also exports `withSession(fn, { state })` and `outline(page)` for one-off exploration scripts |
| `tools/save-login.mjs` | site mode: open a visible browser at the sign-in page, the owner signs in, save the storage state (`--url --until --out`) |
| `pages/` | synthetic test pages (`sample.html`, `counter.html`, `site.html` and `specs.html` for the site test) |

## The project interface

### `walkthrough.config.mjs`

```js
export default {
  name: "my-app",                         // free text
  baseUrl: "http://localhost:3011",        // the app as the takes see it (WALKTHROUGH_BASE_URL, --base-url)
  viewport: "desktop",                     // "desktop" (1440x810 @2) | "phone" (390x844 @3, mobile emulation)
                                           // | { width, height } in CSS px; WALKTHROUGH_VIEWPORT, --viewport
  scale: null,                             // device scale; default from the preset (2 for custom); master = viewport x scale
  fps: 60,
  takesDir: "./takes",                     // WALKTHROUGH_TAKES, --takes
  runnerDir: null,                         // default <takesDir>/_runner
  adapter: "./app.mjs",                    // optional; WALKTHROUGH_ADAPTER
  scenes: "./scenes.mjs",                  // WALKTHROUGH_SCENES
  storageState: null,                      // Playwright storage state JSON to start signed in (a path; keep the file out of git);
                                           // WALKTHROUGH_STORAGE, --storage
  blockUrls: [],                           // glob strings or RegExps; matching requests are aborted (analytics, chat widgets)
  dismiss: [],                             // targets clicked off camera, if visible, before each take's start flashes (cookie banners)
  safeArea: { top: 0, bottom: 120, on: ["click", "mark"] }, // safe band in CSS px; see scrollIntoViewSafe; null = off
  popups: "same-tab",                      // new tabs/windows: "same-tab" | "follow" | "block" (below); WALKTHROUGH_POPUPS, --popups
  dialogs: "accept",                       // alert/confirm/prompt/beforeunload: "accept" | "dismiss"; --dialogs
  session: {
    mode: "new",                           // new | shell | headed; WALKTHROUGH_MODE, --mode
    heartbeat: true,                       // 1 px compositor heartbeat: makes capture gaps measurable
    calibrationDot: false,                 // magenta dot on the real mouse (calibration takes only)
    pointerStart: null,                    // default { x: 0.75 * width, y: height + 40 } (enters from below)
    restGuard: null,                       // { selector, zone, margin } for hover-scroll rows (see rules)
    context: {},                           // extra Playwright context options (permissions, locale, ...)
    launchArgs: [],                        // extra Chromium flags
  },
  finish: { keepRaw: false, crf: 12, preset: "medium" }, // take.finish() options for every take; keepRaw: below
  gate: { maxGapMs: 100 },                 // a take is ok only if its longest capture gap outside waits is <= this
  reload: { path: "/", settleMs: 2500 },   // default off-camera reload after a restore or a resume
  studio: {                                // optional: checkpoint/restore with ../studio
    bin: "../../studio/bin",
    config: "./studio.config.sh",          // STUDIO_CONFIG, --studio-config
    checkpointsDir: null,                  // default: asked from studio/bin/paths.sh
  },
  project: {},                             // anything the scenes need (file paths, ids); read as ctx.config.project
};
```

Only `scenes` is required; everything else has the default shown. Relative paths resolve against the config file. Precedence: CLI flag > environment variable > config file > default. The file may also export a function returning the object.

### Viewport presets

| Preset | Viewport (CSS px) | Scale | master.mp4 | Context |
|---|---|---|---|---|
| `desktop` (default) | 1440x810 | 2 | 2880x1620 | light, motion on |
| `phone` | 390x844 | 3 | 1170x2532 | plus `isMobile`, `hasTouch`, an iPhone Safari user agent (Chromium rendering) |
| `{ width, height }` | as given | `scale` (2) | width x scale by height x scale | as desktop; add `device: { ... }` for other emulation |

`events.json` records `viewport` and `scale` as for any take. The pointer is still driven with mouse events; the film decides whether to draw an arrow or a touch disc.

### Adapter module (all exports optional)

```js
export function init(config) {}                     // called once after loading; set module-level settings here
export async function setupSession(session, config) {}  // after the browser opens, before any take (permissions, routes)
export function prepareTake(take, config) { return take; } // wrap every take; default: guardKeys(take, forbiddenKeys)
export const forbiddenKeys = ["Enter", "Escape"];   // used by the default prepareTake
export async function reload(session, config) {}    // off camera, after a restore or when resuming mid-story;
                                                    // default: goto baseUrl + reload.path, wait reload.settleMs
export async function parkPoint(page, config) {}    // { x, y } where the mouse may rest with no hover effect;
                                                    // used by park() / clickPark(); default: config.project.parkPoint,
                                                    // else 82% / 79% of the viewport
```

The rest of the adapter is the app's own helpers that scenes import: selectors (prefer roles and structure over translated text), how to send a message, how to tell a turn has ended and how it ended, uploads, truth checks over the app's API. Build them on `takes/lib.mjs`: `typeAndSend` + `waitForNetworkTurn` cover a chat-style turn, `uploadWithChooser` covers uploads.

Module-level settings that scenes import can be `export let` bindings set in `init()`: ES module imports are live, so scenes see the values once the runner has called `init`.

### Scenes module

```js
export const SCENES = [
  {
    n: 1,                          // number for --from/--to and status-N files (default: position)
    name: "take-1-signin",         // take folder name (required)
    checkpoint: "CP1",             // optional: in --auto mode, checkpoint after this take
    async pre(session, ctx) {},    // optional, off camera, before the take (session.offCamera(fn) for page work)
    async run(take, ctx) {},       // required: the take itself
    async truth(session, ctx, take) { return {}; }, // optional: read back app state -> truth.json
  },
];
```

`ctx` persists across takes and runs (`<runnerDir>/ctx.json`, and into each checkpoint); put ids and results there that later takes need. `ctx.config` is the resolved config (not saved).

### Site mode: scenes as steps

A scene with `steps` instead of `run` needs no code. Scenes can live in a `.json` file (`scenes: "./scenes.json"`, holding `[...]` or `{ "scenes": [...] }`):

```json
{ "scenes": [ {
  "name": "take-1-search",
  "start": "/pricing",
  "pointer": { "x": 1080, "y": 850 },
  "steps": [
    { "hold": 0.6 },
    { "mark": { "role": "heading", "name": "Pricing" }, "label": "headline" },
    { "type": "ridgeline", "into": { "placeholder": "Search" }, "label": "query" },
    { "click": { "role": "button", "name": "Search" }, "label": "search" },
    { "wait": "quiet", "label": "results" },
    { "hover": { "text": "Result 2" }, "label": "result 2", "hold": 0.8 },
    { "click": { "text": "Result 6" }, "label": "result 6" },
    { "park": true, "label": "result 6 park" }
  ]
} ] }
```

`start` (a path relative to `baseUrl`, or a URL) is opened off camera before the take; `pointer` places the mouse. Step types: `click`, `type` (+ `into`), `hover`, `scroll` (`{ dx, dy, at }`), `reveal`, `safe`, `mark`, `wait` (`"quiet"`, `{ quiet: { ms, timeout, ... } }`, `{ visible: T }`, `{ hidden: T }`, `{ url: "/done" }`), `hold`, `nav`, `press`, `park`. The full list with options is at the top of `takes/steps.mjs`; code scenes can call `runSteps(take, steps)` too.

A target `T` is a CSS selector string or one of:

| Target | Playwright |
|---|---|
| `{ "role": "button", "name": "Search" }` (+ `exact`) | `page.getByRole(role, { name, exact })` |
| `{ "text": "Result 6" }` | `page.getByText(text)` |
| `{ "label": "Email" }` | `page.getByLabel(label)` |
| `{ "placeholder": "Search" }` | `page.getByPlaceholder(...)` |
| `{ "testId": "save" }` | `page.getByTestId(...)` |
| `{ "selector": "li", "has": ".badge" }` | `page.locator(selector, { has })` |

Only visible matches count; the first is used unless `nth` is given. `locate(page, target)` (exported from `take.mjs`) does the same in code, and every take method accepts these targets.

What site mode adds to every take:

- **`blockUrls`**: requests matching a glob or RegExp are aborted for the whole session (analytics beacons, chat widgets, consent managers that re-open).
- **`dismiss`**: before each take's start flashes, each target that is visible is clicked off camera (cookie and consent banners), and the mouse is put back. `take.json` lists what was clicked under `dismissed`.
- **`popups`**: what happens when the page opens a new tab or window (`target=_blank` links and forms, `window.open`). `"same-tab"` (default): an init script turns it into a navigation of the same page before it happens, so the screencast never loses the page; the `nav` event carries `popup: "same-tab"`. `"follow"`: the new tab opens and the screencast moves to it mid-take (one master, one clock); the `nav` event has `newTab: true` and the editor sees a hard cut; when that tab closes the recorder returns to the opener. `"block"`: the new tab is closed at once and logged with `popup: "blocked"`. Use `follow` only when the new tab is the point (an export preview); `same-tab` gives smoother footage.
- **Downloads**: a file the page downloads during a take is saved to `<take>/downloads/` and logged as a `download` event (label of the step that caused it, filename, bytes), so a caption can claim it. Downloads outside a take are discarded.
- **`dialogs`**: alert, confirm, prompt and beforeunload are answered at once (`"accept"`, the default, or `"dismiss"`) and logged as `dialog` events (kind, message, action). A take never hangs on one. Headless Chromium draws no dialog box, so the footage does not show it.
- **`storageState`**: a Playwright storage-state JSON (cookies, localStorage) to start signed in or with consent already given. Make one with `node recorder/tools/save-login.mjs --url <sign-in page> --until <URL part seen after sign-in> --out <project>/login.storage.json`: a visible browser opens, the owner signs in by hand with the test account, and the state is saved when the URL matches. Keep it out of git; it is a credential.

### Tour map: explore a site before writing scenes

```
node recorder/tools/explore.mjs <url> [--config walkthrough.config.mjs] [--depth 2] [--max-pages 20]
     [--storage state.json] [--viewport desktop|phone] [--out <dir>] [--delay 300] [--ignore-robots]
walkthrough explore [url] [...]          (the same, written into the project folder)
```

A breadth-first crawl of same-site links from `<url>` (default: the config's `baseUrl`), to `--depth` hops and at most `--max-pages` pages, one page at a time with `--delay` ms between them. It never clicks, types or submits; it does not follow download, mail, other-site, hash-only, or sign-out and destructive links (a signed-in crawl must not sign itself out), and it honours `robots.txt` for `*` unless `--ignore-robots`. The config's viewport, `storageState`, `blockUrls` and `dismiss` apply (banners are clicked away on every page). Output, in `--out` (default: the current folder):

| File | Contents |
|---|---|
| `tour-map.json` | schema `walkthrough-tour-map/1`: start URL, options, and per page `url`, `title`, `status`, `depth`, `from`, `landmarks`, `headings` (h1-h3), `controls` (the visible interactive nodes of the accessibility tree, at most 80: `role`, `name`, `text` (80 characters), `href`, `box` in CSS px from the page top at scroll 0, `inView`, `landmark`), `thumb`; then `skipped` links with the reason and `unvisited` URLs left when the page cap was hit |
| `tour-map.md` | the same for reading: one section per page, controls as a table |
| `thumbs/<n>.jpg` | the first viewport of page n, 480 px wide |
| `scenes.draft.json` | one declarative scene per page: `nav` to it, `wait quiet`, `mark` of the h1 (label `headline`), clicks on up to 5 primary controls (buttons first, then links in the navigation or header, which are on every page; on a page with neither, one same-site link from the first screen), `hold`. Controls named like delete, remove, pay, checkout, buy, sign out, consent buttons and send/submit buttons are never clicked and are listed under `_skipped` with the reason |

The draft is a starting point the agent edits into `scenes.json`: cut and reorder, add typing and scrolling, replace the first `nav` with `start` to open the page off camera. The drafted scenes of the site-test page record as they are. Limits: it follows links only, so screens reached by clicking (dialogs, tabs, client-side routes without links) are not mapped; a single-page app that routes without `<a href>` maps as one page.

### Built-in waits and scrolling

- **`take.waitQuiet(label, { network = true, dom = true, ms = 800, timeout = 30000, ignoreUrls = [] })`** (also `waitQuiet(take, label, opts)` from `takes/lib.mjs`): a logged wait that ends when no request has been in flight and no DOM mutation has happened for `ms`, or after `timeout`. Outcome `quiet`, or `timeout` with `inflight`, `pending` (up to three URLs) and `domQuietMs`. It is the fallback when a project has no app-specific end detection (an app adapter can do better, like the example adapter's `waitForTurn` on `POST /api/chat`). EventSource, media and websocket requests never count; add long-polling URLs to `ignoreUrls`. The recorder's own flash, dot and heartbeat elements are not counted as mutations. A page with a constant animation that mutates the DOM (a ticking clock, a carousel) never goes quiet: use `dom: false` or a targeted wait.
- **`take.scrollIntoViewSafe(target, { marginTop, marginBottom, label })`** (also `scrollIntoViewSafe(take, target, opts)`): wheel-scrolls (logged, like a person) so the element sits at least `marginTop` px below the top and `marginBottom` px above the bottom of the viewport. Margins default to `safeArea.top` / `safeArea.bottom` (0 / 120). The film crops and scales the frame; a click target at the viewport bottom once lost 70 px of a card in the final cut. With `safeArea.on` containing `"click"`, every `take.click` does this first (scroll label `"<label> (safe)"`); with `"mark"`, every `take.mark` of an element that is partly on screen and fits the band does it too. Elements taller than the band are aligned to its top. When the page cannot scroll far enough the take gets a warning and the scroll event `short: <px>`.
- **`take.hover(target, { label, at, hold = 0.6 })`**: a logged move with role `hover`, then a rest.
- **`take.mark(label, target)`** logs the element's visible `text` (innerText, whitespace collapsed, at most 200 characters; for inputs their value) beside its `box`, so caption claims can be checked against what was on screen.

## The take runner

```
node recorder/takes/run.mjs --config path/to/walkthrough.config.mjs [scene ...] [--from N] [--to N] [--auto] [--fresh]
     [--popups same-tab|follow|block] [--dialogs accept|dismiss] [--parallel N]
```

It opens one session and records the selected scenes in order. After each take it writes `<runnerDir>/status-N.json` (ok, sync, gaps, warnings, truth, unique fps, contact sheet path) and `<take>/verify/sheet.jpg`, then waits for `<runnerDir>/go-N.json`:

| go file | effect |
|---|---|
| `{"action":"next","checkpoint":"CP2"}` | checkpoint (optional: studio data + `storage.json` + `ctx.json`), continue |
| `{"action":"redo","restore":"CP1"}` | restore the checkpoint (optional), reload, record take N again |
| `{"action":"stop","checkpoint":"CP3"}` | checkpoint (optional) and exit |

This is the loop that worked: an agent (or a person) reads the status and the contact sheet, then decides. `--auto` skips the go files: continue while takes pass, checkpoint where a scene names one, stop on the first failure. Values decided between takes go in `<runnerDir>/ctx-override.json` (merged into `ctx` before each take). The scenes module is re-imported before every take, so a script fix needs no restart. Starting at a later scene resumes with the saved `ctx.json` and reloads the app first.

A take is `ok` when the scene did not throw, `masterSync.pass` is true and the longest capture gap outside waits is at most `gate.maxGapMs` (100 ms). On a real app, some re-layouts stall capture for 100-260 ms whatever you do (`docs/CAPTURE_TEST.md`); in the first client walkthrough seven of nine accepted takes had such a stall and were kept, with the stall listed in `takes/INDEX.md`. With go files a reviewer makes that call; with `--auto`, raise `gate.maxGapMs` or the run stops at the first such take.

**Parallel takes** (`--parallel N`, site mode only): the selected scenes are recorded N at a time as independent takes, each in its own browser (own context, cookies and screencast) and its own take folder, starting from a fresh page (the scene's `start`, else `baseUrl` + `reload.path`) with its own `ctx`. `--auto` is implied (no go files; after a failure no new take starts). Browsers launch one at a time, captures run together, and each master is encoded only when no take is capturing, so an encode never takes CPU from another take's screencast. The runner refuses `--parallel` when the config has a `studio`: the takes would share one database and one app state. It starts no servers, so all takes use the config's `baseUrl`. Two screencasts at 2880x1620 load the machine: on the site test, two takes took 31 s instead of 58 s in sequence with both masters in sync, but expect longer capture gaps (raise `gate.maxGapMs` or record in sequence on a busy machine).

Standalone take scripts (one pickup take, no runner) use the same pieces directly; see `examples/brightpost/take-5b.mjs`.

## Driving rules (learned on a real app)

- **Send with the pointer, never Enter.** A keydown can switch an app into keyboard mode (focus rings on, entrance animations off) for the rest of the take. Type with `take.type(text, { method: "insert" })` (the default; `Input.insertText`, no key events), then click Send. `guardKeys` makes `take.press("Enter" | "Escape")` throw; the runner applies it to every take by default. Never press Escape during a running request: it usually cancels it.
- **Detect turns by network, not labels.** Watch the app's own request (`NetworkWatcher` with `requestIs("POST", "/api/chat")`) from before the click; the turn ends when no such request is in flight and a structural condition holds (Send is back, or a question panel is shown) for a settle time. Apps resend on their own (tool results), so the first response is not the end. Classify the outcome from DOM structure (roles, data attributes), not from translated text.
- **Hover hygiene: park the mouse.** Whenever the pointer rests longer than about half a second, move it where nothing reacts to hover (`park(take, "<action> park")`, `clickPark`), never on tiles, chips or images. The adapter's `parkPoint` knows where that is in each screen.
- **The 56 px chip-row edge rule.** Rows that scroll horizontally with faded edges often scroll on their own when the mouse rests within about 56 px of a faded edge. With `restGuard: { selector, zone: 56, margin: 8 }` the recorder keeps every resting point at least 64 px from a faded edge of such a row (shifting within the target), or wheel-scrolls the row first (`guard: "revealed"` in the log).
- **Uploads through the file chooser.** Click the app's own upload control with the pointer; `uploadWithChooser` intercepts the chooser (`page.waitForEvent("filechooser")`) and sets the file, so no OS dialog appears and nothing is drawn. Then wait for the upload response and for the uploaded state to show.
- **Scroll like a person.** The recorder never scrolls invisibly. With `safeArea` on (the default), clicks wheel-scroll their target into the safe band first; otherwise targets must already be in the viewport (a click outside it throws). Use `take.reveal(target)` to bring something into view on purpose, including inside dropdown lists.
- **Keep targets off the edges.** A click or a camera target at the very bottom of the viewport gets cut by the film's crop. The safe band (bottom 120 px by default) prevents that.
- **Heartbeat pixel.** With `heartbeat: true` a 1x1 px element in the top-left corner runs a compositor-only opacity animation, so the browser sends a frame on every refresh even on a still page. A missing frame is then a real capture stall, which the reports count. The film's rounded window corner clips the pixel.
- **Three sync flashes at each end.** One flash's latency jitters by up to a frame and a half; the median of three is stable. The flashes go into the top layer (popover) so a modal cannot cover them. Cut them with `take.json` `sync.keep`.
- **Capture setup.** New-headless Chromium with the GPU (the headless shell fell to 10-14 fps on a real UI with backdrop blur), `--force-device-scale-factor=2` (without it frames come at 1x), 1440x810 at 2x, 60 fps CDP screencast, swscale with `accurate_rnd+full_chroma_int`, CRF 12 master.
- **Pacing.** At least 0.5 s still before an action, at least 1.2 s after a visible result, about 2 s on big reveals.
- **Record on a quiet machine.** No renders, encodes or other browsers during takes (see `docs/CAPTURE_TEST.md`). The app should run as a production build in a sandbox (`../studio`), not the dev server: dev badges and overlays end up in the footage.
- **Label everything the film may anchor to,** and keep labels identical across retakes of the same action. Anchor by (type, label), never by time or id.
- **A redo starts where the last attempt left the mouse.** Restore does not move the pointer; if a take needs a particular start, set it in `pre` (`session.pointer = {...}; await session.page.mouse.move(...)`).

## Known limits

- Response bodies may be unreadable while recording ("evicted from inspector cache"); outcomes rely on status codes and the page, not on bodies.
- Some app re-layouts (a textarea growing a line, a large component mounting) stall capture for 100-260 ms in every capture method. They are measured and listed, not fixed.
- `take.click` targets the element centre unless `at` says otherwise; for text editing use `caretAfter` to click at a character.
