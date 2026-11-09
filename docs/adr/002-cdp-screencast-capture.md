# ADR-002: Capture with the DevTools screencast at 2x, slotting frames by browser timestamp into constant 60 fps

## Status

Accepted

## Date

2026-11-06

## Context

The first attempt captured at 10 fps and 1x, too soft to zoom into, and its frames did not share a clock with
the actions, which is where the 10 s caption drift came from (`examples/brightpost/PLAN.md`). The
film needed sharp frames for punch-ins up to 1.85x, a steady frame rate, and frame times on the same clock as
`events.json` ([ADR-001](001-footage-without-cursor.md)).

## Decision

Full Chromium in **new-headless mode with the GPU**, launched with `--force-device-scale-factor=2`, a 1440x810
viewport at device scale 2 (2880x1620 frames), and the Chrome DevTools Protocol screencast
(`Page.startScreencast`, JPEG q90). Every frame is acknowledged at once and stamped with the browser's own
timestamp; frames are placed into constant-rate 60 fps slots (`slot = round((ts - T0) * 60)`), the last frame
per slot kept. Three 100 ms sync flashes at each end of a take measure render-and-capture latency at both
ends. The master is H.264 CRF 12, BT.709 with accurate swscale flags. If nothing holds 60 fps honestly, the
whole film is delivered at 30 fps; duplicated frames are never presented as 60.

## Alternatives considered

Measured in [`docs/CAPTURE_TEST.md`](../CAPTURE_TEST.md) and listed in the plan:

### agent-browser recording

- Cons: capped the old capture at 10 fps and reset its context on `record start`.
- Rejected on the plan's evidence.

### Screencast in Playwright's default headless shell (method a)

- Pros: passed every synthetic check.
- Cons: renders through SwiftShader, a software GPU; on the real app it held 10-14 fps while a sheet with
  backdrop blur was open (lesson C1).
- Rejected after the first real pass.

### Headed Chrome plus ffmpeg screen capture (method c)

- Cons: a visible window can be covered, scaled or throttled by the desktop; colour depends on the display
  profile; the frames have a separate clock from the action log.
- Kept as the last fallback (`mode: "headed"`); not needed.

### Computer use / a desktop driver

- Cons: takes over the user's screen and is the least repeatable.
- Rejected in the plan.

## Consequences

- Frame size, unique fps, gaps, drift and colour have a pass table, and every take is gated on it
  (`masterSync.pass`, longest gap outside waits ≤ `gate.maxGapMs`).
- Takes need a quiet machine: renders or encodes running at the same time cause gaps (lesson C3). The lead
  schedules around recording.
- Some app re-layouts stall capture for 100-260 ms in every method; they are measured and listed in
  `takes/INDEX.md`, then excised or covered in the edit, not fixed.
- Raw frames cost 2.5-23 MB/s of disk; `startTake` refuses below 4 GB free.
- Code: `recorder/capture.mjs`, `recorder/take.mjs`; re-run the test with `recorder/capture-test.mjs`.
