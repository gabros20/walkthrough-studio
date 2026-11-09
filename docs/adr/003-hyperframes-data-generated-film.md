# ADR-003: Cut the film in HyperFrames from generated compositions, with one source-to-film mapping

## Status

Accepted

## Date

2026-11-06

## Context

The edit has to be made and remade by agents: ranges trimmed, waits compressed into time-lapses, scenes
retaken, picture re-timed to music or to a voiceover. Every overlay (pointer, camera, spotlights, captions,
sound cues) must stay on its frame through all of that, and the result must render the same way every time.

## Decision

The film is a HyperFrames project (HTML rendered to video, `npx --yes hyperframes@0.9.16`, pinned).
`film/build.mjs` reads `storyboard.json` and the takes' `events.json` and **writes** the compositions: static
HTML with one paused GSAP timeline per composition, `fromTo` and `set` tweens with literal numbers and stable
ids, no timers or randomness, muted video, bundled fonts. Nothing is keyed by hand.

One function maps source time to film time for the footage and every overlay:
`film = filmIn + (source − srcIn) / rate`, with `rate = (srcOut − srcIn) / filmDur` and every bound snapped
to a whole frame. Moments in the storyboard are anchors into the event log, not film times
([ADR-009](009-anchor-by-type-and-label.md)).

## Alternatives considered

### A non-linear editor (Premiere, Resolve, Final Cut)

- Cons: manual; an agent cannot drive it reliably; every overlay keyframed by hand would drift on each re-cut;
  no way to rebuild the film from data.
- Rejected.

### Remotion (React to video)

- Pros: also programmatic and deterministic.
- Cons: a second toolchain; HyperFrames was already used in the target repo, and its CLI also supplies
  `check`, `snapshot`, `transcribe` and `audio` analysis that the review, voiceover and sound steps use.
- Rejected on fit, not on capability. The plan records the reason as "deterministic HTML-to-video, already
  used in this repo".

### Hand-written compositions

- Rejected: the same drift problem as an NLE, in code.

## Consequences

- Re-cutting never desyncs: change a range and the pointer, camera, captions and cues move with it.
- `--dry` gives the durations table without rendering, `--audit` checks holds, pointer jumps, dead air,
  caption lint and caption claims, and `--no-captions` gives a twin that is identical to the frame.
- The kit is bound to HyperFrames 0.9.16's render contract (`film/CLAUDE.md`); upgrading means re-checking
  seek safety and the timeline rules.
- Layout numbers are 16:9 constants today; 9:16 and 1:1 need their own layouts
  ([`docs/LOOK.md`](../LOOK.md), Roadmap).
- Code: `film/build.mjs`, `film/lib/edl.mjs` (anchors, mapping), `film/lib/*.mjs` (components). Format:
  [`docs/STORYBOARD.md`](../STORYBOARD.md).
