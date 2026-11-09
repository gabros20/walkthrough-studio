# ADR-001: Record footage without a cursor and log every action; draw pointer, camera and captions afterwards

## Status

Accepted

## Date

2026-11-06

## Context

The first attempt at the first client walkthrough (5 November 2026) had no cursor, no zooms, and captions whose
timings had drifted about 10 s from the picture (`examples/brightpost/PLAN.md`, Context). The new film
needed a pointer that leads the eye, camera punch-ins on the control being used, and captions timed to
actions, and all three had to survive re-cutting: scenes get trimmed, time-lapsed and retaken many times
before picture lock.

## Decision

Takes are app footage with **no cursor in it**, plus `events.json`: a log of every pointer move (with its
control point), press, typed run, scroll, wait, navigation, cursor shape and named element box (`mark`), on
the footage's own clock (contract `walkthrough-take/1`). During recording an invisible real mouse follows the
same arcs and ease the film will draw (`recorder/motion.mjs`), so hover states in the footage match the drawn
pointer. The film build draws the pointer, camera moves, spotlights and captions from the log.

## Alternatives considered

### Record the operating system's cursor into the footage

- Pros: what you see is what happened; nothing to draw.
- Cons: the cursor is baked in at capture resolution, cannot be restyled or hidden at a cut, jumps when a
  scene is trimmed, and a camera zoom enlarges a blurry bitmap. Headless capture has no OS cursor at all.
- Rejected because a re-cut would leave the pointer teleporting and the camera could not frame it cleanly.

### Track the cursor from the video afterwards

- Cons: guessed positions, no element boxes, no event names to anchor captions to.
- Rejected because the recorder already knows exactly where the mouse is and what it clicked.

### A desktop screen-recording app (Screen Studio, Cap)

- Cons: manual, one take at a time, not driven by an agent, no machine-readable log to check captions against.
- Rejected: the job is agent-made films that can be rebuilt from data.

## Consequences

- The pointer is smooth, can never drift from the UI, and moves with the camera because it is drawn inside
  the same wrapper ([`docs/LOOK.md`](../LOOK.md), Pointer).
- The recorder and the film must share one motion model: `film/lib/pointer.mjs` imports
  `../../recorder/motion.mjs`, so `film/` and `recorder/` must stay side by side. `film/scripts/verify-pointer.mjs`
  and `recorder/verify-dot.mjs` check the match (worst error 0.001 capture px; the real mouse within half a
  frame of the curve).
- Page hover reactions can show up to half a frame early or late against the drawn pointer (60 Hz mouse
  steps on a 120 Hz page; [`docs/CONTRACT.md`](../CONTRACT.md) section 7).
- The take format is a versioned contract ([`docs/CONTRACT.md`](../CONTRACT.md)); readers accept
  `walkthrough-take/1` and stop on anything else.
- Anything the film anchors to must be labelled at recording time ([ADR-009](009-anchor-by-type-and-label.md)).
