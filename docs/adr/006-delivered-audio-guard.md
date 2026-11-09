# ADR-006: Nothing is delivered without the `delivered:` line from a measured, muxed file

## Status

Accepted

## Date

2026-11-06

## Context

The HyperFrames render of the picture has no audio stream; the film is silent until the sound build muxes the
mix onto it. On the first job a silent render named like the final film was delivered: it looked finished in
a file list and nobody heard it before it went out (lesson S1). Agents cannot listen, so "it sounds fine"
can never be the check.

## Decision

`sound/build-sound.mjs --deliver <file>` is the only way a film is delivered:

1. A render without an audio stream is first renamed `<name>.picture-only.mp4`, so no silent file keeps a
   final-looking name (its sidecars are still found).
2. The mix is muxed onto it and the captions `.srt` is copied beside the delivery; no captions fails it.
3. The delivered file is measured: an audio stream as long as the film (within a frame), −16 ±0.5 LUFS,
   ≤ −1 dBTP, every 10 s window in range, every effect within a frame of its cue.
4. Only then is the last line `delivered: <path>` (exit 0). Otherwise `NOT DELIVERED (checks failed): <path>`
   (exit 2): the file exists but must not be sent.

`delivery/verify.py` repeats the audio checks on every video in the package and refuses a silent one. Every
audio report says "measured, not heard".

## Alternatives considered

### Rely on review to catch a silent file

- Rejected: it is exactly what failed.

### Mix the audio inside the HyperFrames composition

- Cons: every sound change would need a full picture render, and the mix could only be measured after it.
- Rejected: a separate build re-mixes in about 15 s and measures the file it delivers.

## Consequences

- An agent may not announce a film as done without quoting the `delivered:` line (`CLAUDE.md` guardrails,
  skill `film-sound`).
- Re-running a delivery after a failure uses the renamed `renders/<name>.picture-only.mp4` as `--video`; the
  original name no longer exists.
- Strict loudness and peak limits can refuse a usable mix (for example AAC sibilance over the true-peak
  ceiling); the voiceover build retries with more peak margin, up to 4 dB, before failing.
- Listening checks are still handed to a human ([`sound/README.md`](../../sound/README.md), What a human must
  still do).
