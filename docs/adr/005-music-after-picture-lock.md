# ADR-005: Make the music after picture lock and fit it by bar-aligned loops, not by regenerating

## Status

Accepted

## Date

2026-11-06

## Context

The music bed has to start on the title, have its section changes land on cuts, and resolve on the end card.
Generated music is paid per call (about 2,925 ElevenLabs credits per take on the first film), the free pool
answers "busy" at times, and the model does not return the length asked for: 135.7 s and 43.2 s came back for
a 195 s request (lesson S2).

## Decision

Music is generated **once, after picture lock**, to the film length plus 2 s, by the lead (sub-agents cannot
reach the connector). The sound build (`sound/build-sound.mjs`) keeps the real intro and the real ending and
changes the length in the middle by **whole loops** of the groove, spliced on downbeats (a 30 ms equal-power
crossfade) at the cleanest scored candidate, so the bar grid runs unbroken from film 0. It picks the loop
count and start offset so the final chord lands on the end-card wipe's cut, writes `beat-grid.json`, and the
editor nudges scene changes onto bars with holds only, never footage speed.

## Alternatives considered

### Regenerate until the length is right

- Cons: each call costs credits, may still come back short, and returns different music each time.
- Rejected.

### Time-stretch the track

- Cons: changes the tempo the grid is measured from and adds artefacts across the whole track.
- Rejected in favour of keeping the music as generated and cutting it on bars.

### Score before picture lock

- Cons: every re-cut moves the cuts off the bars and the ending off the end card.
- Rejected.

## Consequences

- One generation per film; the bed rebuilds in about 15 s after any picture change.
- Each join is verified by measurement (spectral and level step, grid shift ≤ 5 ms, click ratio) and a rough
  join fails the build, but nobody in an agent session can hear it: the splice times go to a human for
  listening checks (lesson S6).
- The grid must be measured, not detected (`npx hyperframes audio --only bpm` said 128 BPM for a 96.000 BPM
  take); `sound/analysis/` does this and `music.json` records it.
- Any WAV or MP3 with a steady tempo, a repeating groove and a real ending works, generated or licensed.
- Details: [`sound/README.md`](../../sound/README.md), [`docs/ELEVENLABS.md`](../ELEVENLABS.md).
