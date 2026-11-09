# Take contract (recorder → film build)

*Mode: reference (sections 1-9). Section 10 is a short how-to for recording a take in code, and section 11 records what has been proven; the config, runner and site-mode steps are in [`recorder/README.md`](../recorder/README.md).*

This file is everything the film build needs to know about a recorded take.

**Schema id:** the recorder writes `"schema": "walkthrough-take/1"`, and readers accept only that id; anything else is an error.

A take is app footage with **no cursor in it**, plus `events.json`, a log of every pointer move, click, typed run, scroll, wait, navigation and named element box. The film draws the pointer, camera moves, spotlights and captions from the log.

## 1. Take folder

```
<takesDir>/<take-name>/
  master.mp4          the footage (see 2)
  events.json         the action log (see 3-5)
  take.json           capture stats and sync measurements (for checking, not for editing)
  truth.json          what the scene's truth() read back from the app after the take (runner only; may be null)
  raw/frames.bin      raw screencast JPEGs, concatenated (re-mux source; deleted when finish({ keepRaw: false }) verified the master)
  raw/frames.ndjson   one line per stored frame: {"i","slot","ts","off","len"}
  raw/delivered.json  browser timestamps of every frame the browser delivered (gap and unique-fps reports need it)
  verify/sheet.jpg    contact sheet of up to 20 stills at marks, clicks and 1 s after each wait (runner only)
  verify/stills.txt   time and label of each still
  verify-dot.json     only for calibration takes: pointer-sync check (see 7)
  verify/dot-*.png    only for calibration takes: crops used by that check
```

`<takesDir>` comes from the project config (`takesDir`), `$WALKTHROUGH_TAKES`, or `takes/` at the repo root, in that order. The take runner also writes `<takesDir>/_runner/` (status files, go files, `ctx.json`; see `recorder/README.md`) and capture tests write `<takesDir>/_capture-test/`.

The sample take to build against is made by `node recorder/sample-take.mjs` (about 15 s, synthetic page, calibration dot on): `<takesDir>/sample/`.

## 2. master.mp4

| Property | Value |
|---|---|
| Size | `viewport` x `scale`: 2880x1620 for the `desktop` preset (1440x810 CSS px at 2, the default), 1170x2532 for `phone` (390x844 at 3, mobile emulation) |
| Frame rate | 60 fps, constant (`r_frame_rate` = `avg_frame_rate` = 60/1) |
| Codec | H.264 High, CRF 12, `yuv420p`, one keyframe per second |
| Colour | BT.709 primaries, transfer and matrix, limited (tv) range, all tagged |
| Audio | none |
| Cursor | none drawn by the browser. A calibration take shows a 14 px magenta (#FF00FF) dot centred on the mouse instead |

Frame `n` starts at `n / 60` s. Static stretches hold the last frame (the browser only sends frames when the page repaints; the master fills the gaps with that frame, so no time is lost).

Each take starts and ends with **three 100 ms full-screen green (#00FF00) flashes** (the `sync` events, labelled `start 1..3` and `end 1..3`, about 0.35 s apart). Use only the footage between the end of the last start flash and the start of the first end flash. `take.json` has this range precomputed as `sync.keep {from, to}`. Older single-flash takes use the labels `start` / `end`.

Takes recorded with `heartbeat: true` (the default in the runner) also carry a **1x1 CSS px heartbeat** in the top-left corner (grey at 2-6% opacity, compositor-animated). It makes the browser send a frame on every refresh, so capture gaps are measurable. The film's rounded window corner clips it.

Reference red `#F01020` decodes to 241,16,31 (BT.709 limited range, accurate conversion), within 1 per channel. The conversion that achieves this: Chrome's JPEGs are full-range BT.601, the master is limited-range BT.709, converted with `scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+bicubic,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv`. Without `accurate_rnd` swscale's fast path shifts that red to 239,17,31; without `setparams` the primaries and transfer tags are not written.

## 3. Clock and coordinates

- **Time:** every `t`, `tEnd` and `chars[]` value is in seconds on the master.mp4 clock. `t = 0` is the first frame of the master. To get a frame index: `Math.round(t * fps)`.
- **What a time means:** the time at which the action's effect is visible in the footage (hover states, pressed buttons, typed characters).
  - Frame timestamps (from the browser) and action times (from the recorder) are both system-clock seconds, so an action at wall time `w` is at `w - T0` on the master clock, where `T0` is the first frame's timestamp.
  - The recorder adds the render-and-capture latency, measured with the flashes: the median of 3 at the start (`Ls`) and 3 at the end (`Le`).
  - That latency grows by 1-2 frames once the page is photo-heavy (measured: about 37 ms on a near-white page, 60 ms on a photo-heavy one). So `Ls` applies before the take's longest wait (5 s or more, normally an agent turn), `Le` after it, and it moves linearly across the wait. Without such a wait it moves linearly across the take.
  - The model is in `take.json` `sync.latencyModel` ("step across the longest wait" or "linear across the take"), with its parameters in `take.json` `latency {Ls, Le, wA, wB}`.
  - `node recorder/retime.mjs <takeDir>` re-maps an older take that was logged with one median latency onto this model (only events.json and take.json change).
- **Accuracy:**
  - For each flash group, the median logged flash time lands within 1 frame of the flashes in the decoded master, and no single flash is more than 2 frames off. This is checked on every take (`take.json` → `masterSync.pass`).
  - Single events jitter by about ±1 frame (capture cadence).
  - Pointer positions in a calibration take match the dot to within one frame of travel (section 7).
- **Positions:** CSS px in the viewport (1440x810 by default), origin at the top-left of the page. Multiply by `scale` (2) for master pixels. Boxes are `{x, y, width, height}` in the same space, rounded to 0.01.

## 4. events.json, top level

```json
{
  "schema": "walkthrough-take/1",
  "take": "sample",
  "fps": 60,
  "viewport": { "width": 1440, "height": 810 },
  "scale": 2,
  "video": { "file": "master.mp4", "width": 2880, "height": 1620, "frames": 957, "duration": 15.95 },
  "timeBase": "seconds on the master.mp4 clock; t = 0 is the first frame; frame n starts at n / fps",
  "coordinates": "CSS px in the 1440x810 viewport, origin top-left; multiply by scale for master pixels",
  "pointerStart": { "x": 1080, "y": 850 },
  "motion": { "bend": 0.08, "baseSeconds": 0.35, "pxPerSecond": 2400, "minSeconds": 0.4,
              "maxSeconds": 0.9, "clickLead": 0.18, "pressSeconds": 0.09, "ease": "power3.inOut" },
  "calibrationDot": true,
  "events": [ ... ]
}
```

- `pointerStart`: where the mouse is when the take starts. It may be outside the viewport (the default, `y: height + 40`, is 40 px below the bottom edge, so the pointer enters from off-screen). In a later take of the same session it is where the previous take left the mouse.
- `motion`: the constants of `recorder/motion.mjs` at recording time.
- `events`: sorted by `t`. Every event has `id` (its index in this array, for this file only), `type` and `t`.

## 5. Event types

### Labels and anchors

Every event the film may anchor to carries a `label`: a short human-readable name chosen in the scene script ("send", "option 2", "prompt text"). **Anchor by the pair (`type`, `label`)**, never by `id` or time: the pair is unique within a take (the recorder refuses duplicates) and stays the same across retakes of the same script. One action produces several events with the same label and different types; a click "send" writes `move` "send" (role `approach`), `down` "send" and `up` "send".

Helper actions add a suffix: `"<label> (reveal)"` for a scroll that brings a chip into view before a click, `"<label> (position)"` for the move that places the pointer before a scroll. By convention, the move that rests the mouse somewhere neutral after an action is `"<action> park"` (role `park`). Automatic navigation events are labelled `"url <path>"`, with ` #2`, ` #3` for repeats. `cursor` and `sync` events need no anchor label (`sync` uses `start 1..3` / `end 1..3`).

### `sync` — start and end flashes

```json
{ "type": "sync", "t": 0.3, "label": "start 1", "color": "#00ff00", "duration": 0.1, "predicted": 0.2772, "id": 0 }
```
`t` is where the flash really is in the master (measured from the frames). `predicted` is where the action clock puts it. Cut everything outside `take.json` `sync.keep`.

### `move` — one pointer arc

```json
{ "type": "move", "t": 1.3078, "tEnd": 1.9936, "label": "prompt field", "role": "approach",
  "from": { "x": 1080, "y": 850 }, "to": { "x": 283.66, "y": 727 }, "control": { "x": 691.67, "y": 724.79 },
  "duration": 0.6857, "cursor": "text", "cursorRaw": "text", "id": 2 }
```

The pointer position at time `time` in `[t, tEnd]` is:

```
p     = (time - t) / (tEnd - t)                      // 0..1
u     = p < 0.5 ? 8p⁴ : 1 - (-2p + 2)⁴ / 2            // GSAP power3.inOut (quartic)
pos   = (1-u)² · from + 2(1-u)u · control + u² · to   // quadratic bezier, u used directly
```

`u` is the bezier parameter itself, **not** arc length. If you animate with GSAP, tween a proxy `{u: 0} → {u: 1}` with `ease: "power3.inOut"` and compute the bezier in `onUpdate` (or precompute per-frame positions); do not use MotionPathPlugin's arc-length mapping. `recorder/motion.mjs` exports `positionOnMove(move, t)` and `pointerAt(events, t, pointerStart)` with exactly this maths and no dependencies; the film imports it directly (`../../recorder/motion.mjs` from `film/lib/`), so its export surface (`MOTION`, `clamp`, `moveDuration`, `controlPoint`, `power3InOut`, `bezier`, `positionOnMove`, `pointerAt`) does not change.

Between moves the pointer rests at the previous move's `to` (or at `pointerStart` before the first move). Moves never overlap and never jump: each `from` equals the previous `to`.

- `duration` = `tEnd - t` = `clamp(0.35 + distance/2400, 0.40, 0.90)` s.
- `control` = chord midpoint pushed 8% of the distance sideways, always bowing upward (towards smaller y; a vertical move bows right). It is logged, so you never need to recompute it.
- `role`: `approach` (the move of a click), `move` (a plain move), `hover` (onto an element to show its hover state, followed by a rest), `park` (resting the mouse where nothing reacts to hover), `reveal` (to the middle of a chip row before scrolling it), `position` (before a scroll).
- `cursor` / `cursorRaw`: the pointer shape at `to` when the move ends (see `cursor` below).
- `guard` (only when present): `{ "action": "shifted" | "revealed", "asked": {x, y} }`. The script asked for `asked`, but that point was inside the hover-scroll zone of a faded chip row, so the recorder rested the mouse at `to` instead (still on the same element), or first scrolled the row (`revealed`). Only with a `restGuard` configured.

### `down` / `up` — mouse press and release

```json
{ "type": "down", "t": 2.1754, "label": "prompt field", "at": { "x": 283.66, "y": 727 }, "button": "left",
  "box": { "x": 47, "y": 691, "width": 788.87, "height": 72 }, "id": 5 }
{ "type": "up", "t": 2.2778, "label": "prompt field", "at": { "x": 283.66, "y": 727 }, "button": "left", "id": 6 }
```
`at` equals the approach move's `to`. A double or triple click is logged as one `down`/`up` pair with `clickCount` (2 or 3); `up.t` is after the last release. The press comes `clickLead` (0.18 s) after the approach's `tEnd` (measured, ±5 ms); the release about `pressSeconds` (0.09 s) later. `box` is the clicked element's box at the press (a camera or spotlight target). The click sound and disc go at `down.t`.

### `type` — a run of typed text

```json
{ "type": "type", "t": 2.3399, "tEnd": 5.9002, "label": "prompt text",
  "text": "Winter commuting posts for this weekend", "method": "insert",
  "field": { "tag": "textarea", "id": "prompt" },
  "box": { "x": 47, "y": 691, "width": 788.87, "height": 72 },
  "boxEnd": { "x": 47, "y": 691, "width": 788.87, "height": 72 },
  "chars": [2.3399, 2.4083, 2.4989, "... one time per character ..."], "id": 7 }
```
`chars[i]` is when `text[i]` was entered (`chars.length === text.length`, `t = chars[0]`, `tEnd` = after the last character). `box` / `boxEnd` are the focused field before and after (a textarea can grow). The cadence is a base rate of 14 characters/s (about 12/s on average once pauses are counted) with seeded jitter, longer after spaces and punctuation, and a rare short hesitation; the same script types with the same rhythm every time (`recorder/rng.mjs`). `method: "insert"` means no key events were sent (`Input.insertText`; the app stays in pointer mode); `"keys"` means real key presses. The pointer does not move while typing.

### `key` — a single key press

```json
{ "type": "key", "t": 9.12, "label": "close menu", "key": "Escape", "id": 21 }
```
Rare. App takes avoid key presses: many apps switch into a keyboard mode on any keydown (focus rings on, entrance animations off), and Escape often cancels a running request.

### `scroll` — wheel scroll at the pointer

```json
{ "type": "scroll", "t": 12.0354, "tEnd": 12.669, "label": "history scroll", "at": { "x": 1194, "y": 388.88 },
  "dx": 0, "dy": 640, "container": { "root": false, "box": { "x": 985, "y": 132.8, "width": 418, "height": 640.2 } },
  "before": { "left": 0, "top": 0 }, "after": { "left": 0, "top": 640 }, "id": 34 }
```
Wheel events spread over `[t, tEnd]` with power3.inOut (duration `clamp(0.25 + distance/1600, 0.35, 1.2)` s unless given), at the resting pointer `at`. `container` is the element that scrolled (`root: true` = the page itself; then `box` is the viewport) and `before` / `after` its scroll offsets. The content moves in the footage; the pointer does not.

A scroll the recorder made to keep a click or mark target inside the safe band (`scrollIntoViewSafe`) has `reason: "safe-area"` and the label `"<click or mark label> (safe)"`; `short: <px>` means the page could not scroll far enough and the element stays that many px outside the band.

### `waitStart` / `waitEnd` — something the take waited for

```json
{ "type": "waitStart", "t": 7.0928, "label": "saved", "id": 13 }
{ "type": "waitEnd", "t": 7.4463, "label": "saved", "outcome": "success", "id": 14 }
```
Always a pair with the same label. `waitEnd.outcome` is a short string; extra detail fields may follow. Network-driven turns (`waitForNetworkTurn` in `recorder/takes/lib.mjs`, e.g. an agent reply) look like:

```json
{ "type": "waitEnd", "t": 74.31, "label": "campaign reply", "outcome": "success",
  "requests": 2, "failedRequests": 0, "statuses": [200, 200], "seconds": 61.4, "uiInput": "pointer" }
```
Generic outcomes: whatever the adapter's `classify()` returns, plus `not-sent` (no matching request started), `timeout`, and `failed` (the wait threw; `error` holds the message). `take.waitQuiet` (network idle and no DOM mutations for `ms`) ends `quiet` (with `seconds`) or `timeout` (with `inflight`, `pending` URLs and `domQuietMs`). The example adapter's turn outcomes are `success`, `question`, `inline-question`, `error`, `stopped-or-limit` and `reply`. A wait range is where time-lapses go.

### `nav` — navigation

```json
{ "type": "nav", "t": 0.95, "tEnd": 1.62, "label": "open sign-in link", "url": "http://localhost:3011/login/abc", "id": 3 }
{ "type": "nav", "t": 31.2, "tEnd": 31.2, "label": "url /settings", "url": "http://localhost:3011/settings", "auto": true, "id": 40 }
```
Scripted navigations run from `t` (request) to `tEnd` (page loaded). `auto: true` marks a main-frame navigation the page made itself (a link, a redirect, a client-side route change); it has `t = tEnd`.

### `mark` — a named element's box at a moment

```json
{ "type": "mark", "t": 7.4464, "label": "status line", "box": { "x": 37, "y": 344.8, "width": 890, "height": 22 }, "text": "Saved", "id": 15 }
```
For camera targets, spotlights and caption anchors. The box is valid at `t`; if the layout moves later, the script logs another mark. `text` is the element's visible text at `t` (innerText with whitespace collapsed, at most 200 characters; an input's value), so captions can be checked against what was on screen; it is absent for a mark of a plain box or an element with no text, and a script may set it explicitly (e.g. to an aria-label). Other extra fields may follow (`kind`, `offscreen: true` when the box was outside the viewport). A mark added after the take by `recorder/takes/add-mark.mjs` (for something with no DOM element, positioned relative to another mark's box) carries `source` and `measuredAfterTake: true`.

### `cursor` — the pointer's shape changed

```json
{ "type": "cursor", "t": 6.7698, "cursor": "pointer", "raw": "pointer", "at": { "x": 1064, "y": 735 }, "id": 10 }
```
Logged whenever the CSS cursor under the mouse changes, during moves and at rest (polled every 200 ms at rest, so a change caused by the page itself is logged up to 0.2 s late). `raw` is the computed CSS `cursor` of the element under the mouse. `cursor` is the resolved shape:

| `cursor` | when | draw |
|---|---|---|
| `default` | arrow (`auto` over non-text, `default`, or nothing under the mouse: `raw: "none-element"`) | arrow |
| `pointer` | links and buttons | pointing hand |
| `text` | `raw: "text"`, or `raw: "auto"` over an editable field, or `raw: "auto"` over selectable static text | I-beam |
| anything else | the CSS value as is (`grab`, `not-allowed`, ...) | arrow, unless you add a shape |

`raw: "auto"` + `cursor: "text"` over static text (Chrome shows an I-beam there) flickers while scrolling past lines of text. Showing the arrow for `raw: "auto"` and the I-beam only for `raw: "text"` or the field of a `type` event is a reasonable editorial choice. The shape for any time is the latest `cursor` event at or before it; each `move` also carries the shape at its end.

## 6. Re-muxing

`raw/frames.ndjson` keeps every stored frame's browser timestamp `ts` (system clock seconds). At most one frame is stored per 1/60 s slot (the last one delivered in it). `take.json` holds `T0` (the first frame's timestamp). A master at another rate (needs `raw/frames.bin`):

```
node recorder/remux.mjs <takeDir> --fps 30        # writes master-30.mp4; events.json stays valid (times are seconds)
```

## 7. Calibration takes (pointer sync)

With `openSession({ calibrationDot: true })` the page draws a 14 px magenta dot centred on the real mouse. `node recorder/verify-dot.mjs <takeDir>` decodes frames at sampled times, finds the dot, and compares it with `pointerAt(events, t)`:

- at rest the dot is within 1.5 CSS px of the logged point (sample take: 0.30 and 0.37 px);
- while moving, the dot matches the logged curve at a time within one frame of `t` (sample takes: -8 to +12 ms). At the middle of a long move the pointer travels up to about 80 CSS px per frame (peak speed is 4x the average with power3.inOut), so a pixel distance there is not a useful measure.

The moving-case jitter comes from stepping the real mouse at 60 Hz while the page renders at 120 Hz; it only affects page hover reactions, which can show up to half a frame early or late against the drawn pointer.

To check the drawn pointer, overlay it on a calibration take: the arrow's tip must sit on the dot at rest and track it within a frame while moving.

## 8. take.json (checking, not editing)

Fields the film build or a reviewer may read:

| Field | Meaning |
|---|---|
| `mode`, `browser`, `fps`, `scale` | capture method and Chromium version |
| `capture` | `T0`, frames stored, bytes, delivered fps, delivery gap median / p99 / max, receive-minus-timestamp drift |
| `sync.flashes[]` | each flash: label, `t` in the master, `latencyMs`, `errorFrames` |
| `sync.keep {from, to}` | the usable footage range |
| `sync.startLatencyMs`, `endLatencyMs`, `latencyModel` | the latency model (section 3) |
| `masterSync` | flashes found in the decoded master: per flash `logged`, `measured`, `errorFrames`; `startMedianErrorFrames`, `endMedianErrorFrames`, `pass` |
| `gaps` | longest frame gap outside and inside waits (only meaningful with the heartbeat on) |
| `uniqueFps` | runner only: distinct 1/60 s slots with a frame per second, split into agent waits, 3 s after each wait, and the rest |
| `warnings` | e.g. a resting point the rest guard could not shift, a mark that was skipped, a safe scroll that fell short |
| `dismissed` | the `dismiss` targets that were visible and clicked before the take's start flashes |
| `T0`, `L`, `latency {Ls, Le, wA, wB}`, `flashWall` | raw clock data, for `retime.mjs` and the reports |

## 9. takes/INDEX.md

A per-project index of the takes, written for the film build and reviewers. The per-take sections are generated by `node recorder/takes/index-data.mjs --takes <takesDir> > section.md` (folders named `take-<n>...` only); everything above them is written by hand.

Hand-written part, in this order: how the takes were made (capture method, sessions, sync, pacing, hover hygiene), label changes since the previous pass, agent-turn count, story notes and deviations, frozen stretches (summary), truth checks, the checkpoints table, then `## Per take`.

Per-take section format (one `## <take-folder>` each):

```
## take-2-campaign

- master.mp4: 2880x1620, 60 fps, 78.33 s. Keep 1.18-77.00 s (sync flashes outside).
- Sync: flash-group median error start -0.25 / end 0.15 frames (pass: true); latency 21.16 -> 20.61 ms (step across the longest wait).
- Waits (label: range, outcome):
  - "campaign reply": 15.83-72.55 s (56.72 s), success, chat request 56.1 s
- App's own duration line: "Worked for 56 s" (mark "reveal worked for" at 75.56 s)
- Frozen stretches over 100 ms outside agent waits (start-end on the master clock): none
- Inside agent waits: 14 gaps over 100 ms (max 275 ms); time-lapse these ranges.
- Unique frames per second: agent waits (loaders, streaming) median 58, p10 45, min 35 (56 s); 3 s after each reveal median 57, p10 55, min 55 (3 s); rest median 59, p10 57, min 55 (16 s).
- Timeline (type "label" t[-tEnd]; marks give boxes in events.json):
  - 2.63 mark "hero composer"
  - ...
- Truth data (truth.json, copy text omitted here): `{...}`
```

A frozen stretch line reads `<start>-<end> s (<ms> ms): <what was happening>; pointer at rest | MOVING (move "<label>")`, for example `33.30-33.43 s (133 ms): typing "headline text" (field grows a line); pointer at rest`. These are capture gaps (the page did not repaint, or capture stalled) on the master clock. The film should avoid holding on them or cover them; a gap while the pointer is moving shows as a pointer jump if the pointer is drawn from the log over a frozen frame. Gaps inside waits of 5 s or more are listed only as a count, since those ranges are time-lapsed. The App's own duration line appears only when a mark label ends in "worked for".

## 10. Recording a take

Requires Node 22 or newer (developed on 24), ffmpeg 8, and `playwright-core@1.62.1` with its Chromium build 1234 (`cd recorder && npm install && npx playwright-core install chromium`).

```js
import { openSession } from "./recorder/take.mjs";
import { guardKeys, typeAndSend, waitForNetworkTurn, requestIs } from "./recorder/takes/lib.mjs";

const session = await openSession({ heartbeat: true });     // new-headless (GPU), 1440x810 @2x, light, motion on
await session.page.goto("http://localhost:3000/");          // off camera
const take = guardKeys(await session.startTake("take-2"));  // screencast on, start flashes
await take.click(locatorOrSelector, { label: "platform picker" });
const w = await typeAndSend(take, { field, send, text: "First frost ...", label: "campaign", match: requestIs("POST", "/api/chat") });
await waitForNetworkTurn(take, w, { label: "campaign reply", calm: async () => send.isVisible() });
await take.mark("preview pane", '[data-pane="preview"]');
const summary = await take.finish();                         // end flashes, encode, verify, write files
// the session (browser, cookies, pointer position) stays open for the next take
await session.close();
```

Take API (all methods await until the action is complete; every `label` is required and unique per event type):

| Call | Logs |
|---|---|
| `openSession({ mode, scale, width, height, device, calibrationDot, heartbeat, pointerStart, storageState, restGuard, blockUrls, dismiss, safeArea, context, launchArgs, takesDir })` | — |
| `session.offCamera(fn)` (between takes; puts the mouse back) | — |
| `session.startTake(name, { dir, fps, quality, overwrite })` | `sync` start |
| `take.moveTo(target, { label, at, role })` | `move` |
| `take.click(target, { label, at, lead, press, count })` | `scroll` "(safe)" if needed, `move` (approach), `down`, `up` |
| `take.reveal(target, { label, align })` | `move` "(position)" + `scroll`, only if the element is not comfortably in view |
| `take.type(text, { label, cps, seed, method })` | `type` (types into the focused field) |
| `take.press(key, { label })` | `key` |
| `take.scroll({ dx, dy, label, at, duration })` | `scroll` (+ `move` "(position)" if `at`) |
| `take.mark(label, target, extra)` | `mark` (with `text`; a safe scroll first if the element sits near the edge) |
| `take.hover(target, { label, at, hold })` | `move` (role `hover`) |
| `take.scrollIntoViewSafe(target, { marginTop, marginBottom, label })` | `scroll` (`reason: "safe-area"`), only if needed |
| `take.waitQuiet(label, { network, dom, ms, timeout, ignoreUrls })` | `waitStart`, `waitEnd` (`quiet` / `timeout`) |
| `take.wait(label, fn)` | `waitStart`, `waitEnd` |
| `take.nav(url, { label })` | `nav` |
| `take.hold(seconds)` | nothing (a pause) |
| `take.finish({ preset, crf, keepRaw, encode, tail })` | `sync` end; writes the folder |

`target` is a Playwright Locator, a CSS selector, a `{ role, name }` / `{ text }` / `{ label }` / `{ placeholder }` / `{ testId }` / `{ selector }` spec (see `locate` in `recorder/take.mjs`), a box `{x,y,width,height}` or a point `{x,y}`; `at` picks a spot in the box as fractions (default centre). The recorder never scrolls invisibly: with `safeArea` on, a click wheel-scrolls its target into the safe band first; otherwise targets must already be inside the viewport (use `take.reveal`). `take.click` does not scroll inner lists: an option scrolled out of view inside a dropdown must be brought in with `take.reveal(option)` first, which wheel-scrolls the list. A take folder that exists is not overwritten unless `overwrite: true`. `startTake` refuses to start below 4 GB free disk and warns below 12 GB.

## 11. Status

**Proven** (measured; see `docs/CAPTURE_TEST.md`):
- Capture method, frame rate, frame size, colour, sync, and the memory and disk bounds.
- Pointer paths, click timing, typing, scroll, marks, waits and cursor logging.
- The chip-row rest guard, on a synthetic row only.
- The calibration dot check.

**Proven on a real app** (the first client walkthrough, anonymised as Brightpost, 2026-11-06, nine takes; see `examples/brightpost/README-recorder-notes.md`):
- Sending a chat message with the pointer and detecting the end of an agent turn from the network (`success` outcome, 23 turns).
- Uploads through an intercepted file chooser, `guardKeys`, structural selectors.
- Typing with `Input.insertText`: the app stayed in pointer mode on every turn.
- `take.reveal` inside a dropdown list.

**Not exercised on a real app:**
- Turn outcomes other than `success` (checked only against a mock).
- The chip-row guard: no real click needed it.

**Known limit:** while recording, response bodies can be unavailable to the recorder ("content was evicted from inspector cache"); `uploadWithChooser` reads the body as soon as the response arrives, but `body` may still be null. Outcomes therefore rely on the status code and on what the page shows, not on the body.
