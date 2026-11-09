# ADR-009: Anchor the edit to events by (type, label), never by id or time

## Status

Accepted

## Date

2026-11-06

## Context

The storyboard has to point at moments in the takes: where a range starts, which click a caption lands on,
which box the camera frames. Takes get retaken (a full pass after the app fixes, single scenes after review),
so every time and every event's position in the log changes between versions of "the same" take.

## Decision

Every event the film may anchor to carries a `label` chosen in the scene script ("send", "option 2",
"prompt text"). The storyboard refers to events as `"type:label"` (or `"type:label#n"` for the n-th
repeat), for example `"down:send"` or `"mark:preview pane"`, with an optional offset and edge. The recorder
refuses duplicate labels within a type in one take, and the same action keeps the same label across retakes.
Caption claims check against a mark by label (`"claims": "mark:<label>"`).

## Alternatives considered

### Film times in the storyboard

- Cons: every trim, time-lapse or retake shifts everything after it.
- Rejected; film time is always derived ([ADR-003](003-hyperframes-data-generated-film.md)).

### Source times in the take

- Cons: a retake has different times for every action.
- Rejected.

### Event ids or indexes

- Cons: one extra logged event (a safe-area scroll, a reveal) renumbers everything after it.
- Rejected.

## Consequences

- A storyboard survives a retake of the same script unchanged, as long as the labels are kept; label changes
  between passes are listed in `takes/INDEX.md`.
- Labelling is a recording-time discipline: an unlabelled moment cannot be anchored, and an unknown ref fails
  the build with the list of known labels (`film/scripts/list-events.py <take>` prints them).
- Helper actions add predictable suffixes (`"<label> (safe)"`, `"(reveal)"`, `"(position)"`, `"<action> park"`).
- Code: `findRef` in `film/lib/edl.mjs`; format: [`docs/CONTRACT.md`](../CONTRACT.md) section 5 and
  [`docs/STORYBOARD.md`](../STORYBOARD.md), Anchors and refs.
