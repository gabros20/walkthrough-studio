# Capture test

*Mode: explanation (why this capture method; the measurements) with a reference pass table and a short how-to (Reproduce). The decision itself: [ADR-002](adr/002-cdp-screencast-capture.md).*

How the capture method was chosen, the checks a capture method must pass, and how to re-run them on a new machine or a new Chromium. Measured 2026-11-06 on an Apple M3 Pro (11 cores), macOS 26.3, Node 24.16, ffmpeg 8.0.1, `playwright-core@1.62.1`, Chromium 151.0.7922.34 (build 1234).

## Result

The recorder uses **method (b): full Chromium in new-headless mode, at device scale 2, with the DevTools screencast at 60 fps.** It is the default (`openSession({ mode: "new" })`).

The three methods, in the order they were tried:

| | Method | `mode` | Outcome |
|---|---|---|---|
| (a) | DevTools screencast in the **headless shell** (Playwright's default headless) | `shell` | Passed every synthetic check and was locked first. Failed on the real app: it renders through SwiftShader, a software GPU (WebGL renderer "SwiftShader Device"). On a real UI it held only **10-14 fps** for 16 s while a sheet with backdrop blur was open, and 21-28 fps while typing. |
| (b) | DevTools screencast in **full Chromium, new headless** | `new` | Uses the real GPU ("ANGLE Metal Renderer: Apple M3 Pro"). Repeated the synthetic test with the same results; on the real app it holds a median of 58-61 unique fps per second outside agent waits in every take. **In use.** |
| (c) | Full Chromium **headed** (a visible window) | `headed` | Kept as a fallback; not needed. A visible window can be covered, scaled or throttled by the desktop, so it is the last resort. |

Settings that matter for every method:

- `--force-device-scale-factor=2` at launch. Without it the screencast sends 1440x810 frames even with `deviceScaleFactor: 2` in the context (measured: 1440x810 JPEGs). With it, frames are 2880x1620.
- `--disable-background-timer-throttling`, `--disable-backgrounding-occluded-windows`, `--disable-renderer-backgrounding`, `--force-color-profile=srgb`.
- JPEG frames at quality 90, converted to the master with accurate rounding: `scale=in_color_matrix=bt601:in_range=pc:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int`. Without `accurate_rnd`, swscale's fast path shifts `#FD000D` to 250,0,10. A `setparams` filter is also needed, or the primaries and transfer tags are not written.
- Master: H.264 CRF 12, preset medium, one keyframe per second, constant 60 fps.

## The pass table

| Check | Pass |
|---|---|
| Frame size | 2880x1620 (viewport x 2) |
| Unique frames per second, median | ≥ 57 idle, ≥ 50 under load |
| Longest gap in the master | ≤ 100 ms |
| Drift between the start and end flashes | ≤ 1 frame |
| Flash logged vs found in the decoded master | each flash group's median within 1 frame, no single flash more than 2 frames off |
| Reference red `#FD000D` after decode | ±3 per channel (expect 252,0,12) |
| Recorder memory | bounded (flat over a 5-minute take) |
| Raw frames on disk | bounded (at most one frame per 1/60 s slot) |

The take runner applies the same rules to every real take: `ok` = the scene did not throw, `masterSync.pass`, and the longest gap outside waits ≤ 100 ms.

## Method

The test page `recorder/pages/counter.html` writes its animation-frame number into every frame as 24 black/white blocks (plus a black and a white calibration block), and shows a static `#FD000D` patch, a moving block and a spinning ring. `#load` adds, all running at once:

- 60 cards toggling CSS transitions (transform, opacity, shadow, colour) every 400 ms;
- a new object URL of a 1600x1200 JPEG every 700 ms, forcing a decode;
- streamed text, one word every 25 ms, in a scrolling panel;
- 25-45 ms main-thread blocks every 250 ms;
- a Web Worker at about 60% duty;
- two Node threads at about 60% duty in the recorder process.

Each run is a real take (`recorder/take.mjs`): sync flashes, hold, sync flashes, encode the master (CRF 12, preset medium), then `recorder/capture-test.mjs` decodes the master and reads the block counter in every frame.

- **Unique frames per second:** distinct counter values in each 60-frame second of the master between the flashes.
- **Longest gap:** the longest run of master frames showing the same counter value. "Delivery gap" is the longest interval between frames the browser actually sent.
- **Drift:** change in the action-to-frame offset between the start and end flashes, in frames.
- **Reference red:** the central 120x120 CSS px of the patch, decoded at full resolution from a mid-take frame with an accurate BT.709 conversion. Result is the mean and the largest per-pixel deviation from 253,0,13.

The page renders at about 120 Hz, so with nothing slowing it, every 1/60 s slot gets a fresh frame.

## Numbers, method (a), 2x, 60 fps (one flash at each end)

| Check | Pass | Idle 30 s | Load 60 s | Idle 5 min (drift) |
|---|---|---|---|---|
| Frame size | 2880x1620 | 2880x1620 | 2880x1620 | 2880x1620 |
| Unique frames/s, median | ≥ 57 idle, ≥ 50 load | **60** (min 60) | **51** (min 44, p10 47) | **60** (min 59) |
| Longest gap in master | ≤ 100 ms | **16.7 ms** | **83.3 ms** | **33.3 ms** |
| Delivery gap, max (browser → recorder) | | 19.4 ms | 29.5 ms | 34.0 ms |
| Delivered frames/s | | 92.6 | 69.6 | 93.3 |
| Page's own frame rate | | 120 | 62.9 | 120 |
| Drift between the two flashes | ≤ 1 frame | 0.08 | 0.82 | **0.02** (300.7 s apart) |
| Flash logged vs found in master (start / end) | ≤ 1 frame | -0.45 / +0.11 | -0.81 / +0.28 | -0.30 / +0.03 |
| Reference red after decode | ±3 per channel | 252,0,12, max dev 1 | 252,0,12, max dev 1 | 252,0,12, max dev 1 |
| Recorder memory (RSS start → max) | bounded | 163 → 205 MB | 237 → 334 MB | 163 → 191 MB |
| Raw frames on disk | bounded | 75.5 MB | 1407.6 MB | 739.6 MB |
| master.mp4 | | 3.5 MB | 98.7 MB | 33.1 MB |

All checks pass. Two more load runs measured median 50 (min 44, longest gap 83.3 ms) and median 51 (min 47, longest gap 66.7 ms). **The load margin is thin:** 51 against a threshold of 50. What limits the load case is the page, not the capture: under that load the page itself produced only 62.9 frames/s, and the 83 ms gap is a stretch where the main thread did not repaint the counter while the browser kept sending frames (the delivery gap never exceeded 29.5 ms). A real browser on a real screen would show the same stall.

## Numbers, method (b), new headless, 2x, 60 fps (three flashes at each end)

| Check | Pass | Idle 30 s | Load 60 s |
|---|---|---|---|
| Frame size | 2880x1620 | 2880x1620 | 2880x1620 |
| Unique frames/s, median | ≥ 57 / ≥ 50 | **60** (p10 60) | **55** (min 44, p10 53) |
| Longest gap in master | ≤ 100 ms | **16.7 ms** | **66.7 ms** |
| Delivery gap, max | | 29.8 ms | 30.5 ms |
| Flash groups, median error start / end | ≤ 1 frame | -0.22 / -0.24 | -0.10 / +0.29 |
| Reference red after decode | ±3 | 252,0,12, max dev 1 | 252,0,12, max dev 1 |
| Recorder memory (RSS start → max) | bounded | 126 → 154 MB | 249 → 329 MB |

The idle minimum of 48 unique/s is the window that holds the start flashes, where the counter is covered. The 5-minute drift run was done with method (a) only (0.02 frames). In real takes recorded with method (b), up to 140 s long, both flash groups land within 1 frame, and clock drift between browser and recorder stays under 3 ms.

## Do not record while the machine is busy

A 5-minute idle run made while other ffmpeg encodes (preset medium at 2880x1620) and two more headless browsers ran on the same Mac measured median 60 but **min 42 unique/s, a 216.7 ms gap (delivery gap 216.5 ms) and 0.8 frames of drift: it fails the gap check.** During real takes nothing CPU-heavy may run at the same time: no renders, no encodes, no other recordings. `take.finish()` encodes only after capture has stopped, so a take never competes with its own encode.

The same happened when this toolkit was extracted (2026-11-09, load average 9-11 from parallel render jobs): the sample take still passed sync, but a runner test take had a 120-170 ms gap right after a click, and one self-test take put a single end flash 10 frames off with a 3.1 s delivery gap. Re-record such takes on a quiet machine; do not loosen the checks.

## Disk and memory

- At most one frame is stored per 1/60 s slot (the last one delivered in it). Memory stays flat: one pending frame plus a timestamp array.
- Raw frames measured: 2.5 MB/s for the idle counter page (mostly white, repaints every frame), 4.2 MB/s for the sample take, 23 MB/s under the full load above. A 6-minute take of a real app is estimated (not measured) at 1-8 GB. `startTake` refuses to start below 4 GB free and warns below 12 GB. `take.finish({ keepRaw: false })` deletes `raw/frames.bin` once the master has verified; the timestamps are kept.

## Sync accuracy, pointer

From the sample take (`node recorder/sample-take.mjs`, calibration dot on, then `node recorder/verify-dot.mjs <takeDir>`), recorded after the ease fix (`power3InOut` is GSAP's quartic power3.inOut; it was the cubic power2 curve before):

| Frame | State | Logged pointer | Dot found | Distance | Time match |
|---|---|---|---|---|---|
| 247 | rest while typing | 283.66, 727.00 | 283.39, 726.75 | 0.37 px | |
| 423 | rest on Send, mouse down | 881.43, 741.00 | 881.23, 740.77 | 0.30 px | |
| 99 | mid-move (peak speed) | 686.98, 756.68 | 652.73, 750.77 | 34.8 px | dot = curve at t + 8 ms |
| 391 | mid-move | 568.29, 709.80 | 585.04, 709.72 | 16.8 px | t + 4 ms |
| 566 | 30% into a move | 506.20, 199.24 | 505.96, 198.93 | 0.4 px | t + 0 ms |

At rest the page's mouse is within 0.4 CSS px of the log. While moving, it matches the logged curve within 8 ms, about half a frame. At peak speed (up to about 80 CSS px per frame on long moves; power3.inOut peaks at 4x the average speed) that is the 35 px seen at frame 99. The re-run on 2026-11-09 with the extracted recorder (method b, busy machine) passed the same check: rest 0.30 and 0.35 px, moving +12, -13 and -3 ms.

## Real app: what the synthetic test did not show

- **Capture latency depends on content.** Render-and-capture latency grows from about 37 ms to 60 ms going from a near-white page to a photo-heavy page. A single latency for a whole take put one end of agent-turn takes 1-2 frames off, so the recorder measures latency at each end with 3 flashes and switches across the longest wait (see `docs/CONTRACT.md`, section 3).
- **App re-layout stalls.** At some moments the screencast gets no frame for 100-260 ms in both methods, while the page itself renders at 120 Hz without capture (rAF max gap 10 ms). Seen on: a composer textarea growing by a line while typing (the same text kept to one line has a 20-25 ms max gap), a 9:16 preview mounting, an edited image re-rendering, the UI language switching, a sheet closing. Neither JPEG quality 75 nor scale 1.5 changes this, and neither does the typing method (insertText, execCommand, key events). The take runner lists these per take in `takes/INDEX.md` so the film can avoid them.

## Reproduce

```
cd recorder
npm install
npx playwright-core install chromium        # Chromium build 1234 for playwright-core 1.62.1
node capture-test.mjs new 2 idle 30
node capture-test.mjs new 2 load 60
node capture-test.mjs new 2 drift 300
# other methods: shell | headed; scale 1.5
node sample-take.mjs && node verify-dot.mjs ../takes/sample
```

Results go to `<takesDir>/_capture-test/<mode>-<scale>x-<phase>/result.json` (`$WALKTHROUGH_TAKES`, else `takes/` at the repo root). Each result line has `uniquePass`, `gapPass`, `syncPass` and `redPass`.
