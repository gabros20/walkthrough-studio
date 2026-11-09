# storyboard.json

*Mode: reference. The "Drafting and auditing" section at the end is how-to; a worked run of both is in [`TUTORIAL-first-site-tour.md`](TUTORIAL-first-site-tour.md).*

The storyboard is the film's edit decision list. `film/build.mjs` reads it together with the take
folders (`events.json` + `master.mp4` per take, see `docs/CONTRACT.md`) and writes the whole
HyperFrames project: one pre-cut clip per scene, one composition per scene, the title and end cards,
the captions track, `cues.json`, `captions.srt` and `edl.json`, all into the film project folder
(`film/README.md`, Projects); the storyboard normally lives there too, as `storyboard.json`.

Nothing in the storyboard is a film time. Every moment is an **anchor** into a take's event log, and
one mapping turns source time into film time for the footage and every overlay at once. Re-cut a
range and the pointer, camera, spotlights, captions and sound cues move with it.

Worked examples: `film/storyboard.example.json` (three short scenes over `takes/sample`) and
`examples/kleber-content-ai/storyboard.json` (the 13-scene, 3:02 film).

## The mapping

For each kept source range of a scene:

```
film = filmIn + (source - srcIn) / rate        rate = (srcOut - srcIn) / filmDur
```

- `filmIn` is where the range starts in the scene (ranges follow each other, the first at 0).
- `rate` is 1 for normal speed, above 1 in a time-lapse, below 1 in a stretch.
- Every bound is snapped to the frame grid shared by film, clip and source: the gcd of their frame
  rates (30 for a 60 fps film over 30 fps clips of a 60 fps master; 60 for 60/60/60).
- Anchors snap to the same grid, so an anchor 3 ms past a snapped range end does not land in cut
  footage.
- An anchor that falls in footage the storyboard did not keep is an error (it names the anchor and
  its source second).
- A pointer move that crosses a cut is skipped with a warning; the pointer is placed where the mouse
  was at the next range's first frame.

`lib/edl.mjs` `buildMapping()` is the only place this is computed. `edl.json` records every scene's
ranges as mapped (`srcIn`, `srcOut`, `filmIn`, `filmDur`, `rate`, `timelapse`), so other tools
(`voiceover/remap.py`, `film/scripts/holds.py`) can invert it.

## Anchors and refs

- **Ref**: `"type:label"` or `"type:label#n"` (the n-th event of that type and label, 1-based) into the
  take's `events.json`. Type `*` matches any type. Types come from the recorder: `move`, `down`, `up`,
  `type`, `scroll`, `mark`, `waitStart`, `waitEnd`, `cursor`, `sync`. An unknown ref fails with the list
  of known labels (`python3 film/scripts/list-events.py takes/<take>` prints them too).
- `"keep:from"` / `"keep:to"`: the take's usable span between its sync flashes (`take.json`
  `sync.keep`). Every range is clamped inward to that span, with a warning if it reached more than a
  frame into the flashes.
- **Anchor**: `{ "ref": "...", "offset": 0, "edge": "start" | "end" }` (edge `end` uses the event's
  `tEnd`, e.g. the end of typing) or a bare number of source seconds.
- **Box** (camera, spotlight, push target): a ref whose event has a box (`down`, `mark`, a scroll's
  container), a list of refs (their union), or an explicit `{ "x", "y", "w", "h" }` in capture px.

## Top level

| Key | Default | Meaning |
|---|---|---|
| `takesDir` | `<project>/takes`, else `../takes` next to the project | Folder of take folders. Relative to the storyboard. Overridden by `--takes <dir>` or `WALKTHROUGH_TAKES`. |
| `brand` | `<project>/brand.json` if present | Brand file for this film, relative to the storyboard (see `film/README.md`, Brand). `--brand` and `FILM_BRAND` win over it. |
| `look` | none | Layout overrides for this film only (same keys as the brand file's `look`). |
| `fps` | 30 | Film frame rate. `FILM_FPS` wins. Use 60 when the capture test passed at 60. |
| `clipFps` | film fps | Rate of the pre-cut scene clips. |
| `target` | `{ "min": 180, "max": 195 }` | Film length range for the durations table. |
| `title` | `{ "duration": 8 }` | Title card: `duration`, `lines` (two strings; default: the brand's `cards.title`), `target`. |
| `end` | `{ "duration": 7, "wipeStart": 2.4 }` | End card: `duration`, `lines` (default: the brand's `cards.end`), `wipeStart` (s into the card; its cut is `wipeStart + 0.45`; 2.05 puts the cut one 2.5 s bar after the card starts), `lastCaption`, `target`. |
| `captions` | `true` | `false` builds the voiceover twin (same as `--no-captions`). |
| `heartbeatCover` | `{ "x": 0, "y": 0, "w": 3, "h": 3 }` | CSS px box over the recorder's 1 px timing marker; each frame the pixels just right of it are copied over it. `false` turns it off. |
| `motionBlur` | `false` | Root `data-motion-blur`. Off: in 0.9.16 it showed no visible smear on these movers. |
| `music` | none | `{ "beat": 0.625 }`: the music grid's beat in seconds, used by montages. |
| `groups` | none | `{ "<g>": { "name", "target" } }`: story scenes cut from several storyboard scenes get a subtotal row. |
| `scenes` | required | The stage scenes in film order. |

## A scene

```jsonc
{
  "id": "s2",                 // composition id and clip name; unique
  "take": "take-2",           // folder in takesDir
  "target": 24.0,             // wanted film seconds (durations table only)
  "group": "2",               // optional: subtotal group
  "enter": "settle",          // optional: "settle" | "whip" | "hard" (default: caused by the previous exit)
  "ranges": [ ... ],          // kept source, in story order
  "excise": [ ... ],          // spans dropped from inside kept ranges
  "autoExcise": true,         // capture gaps from takesDir/INDEX.md cut automatically
  "holdFrames": [ 41.212 ],   // single blank master frames replaced by the frame before
  "pointer": { ... },
  "camera": [ ... ],
  "spotlights": [ ... ],
  "captions": [ ... ],
  "exit": { "type": "push", "ref": "down:Export" }
}
```

The first scene settles in after the title's hard cut. A scene's entrance otherwise follows the
previous scene's exit: after a `push` it settles in (arrives 6% large), after a `whip` it whips in,
after `hard` it cuts.

### ranges

Each range is `{ "from": anchor, "to": anchor }` plus at most one of:

| Option | Meaning |
|---|---|
| `"timelapse": { "duration": s, "label": "Time-lapse" }` | Compressed to `duration` film seconds; an on-screen tag shows the label and the speed (`12×`) for exactly that span. Clicks inside are cued but get no click sound. |
| `"stretch": { "duration": s }` | A still moment held longer (rate below 1), untagged. Only while the pointer is at rest. |

Sugar that expands into several ranges:

- **Agent wait**: `{ "from": anchor?, "wait": "<label>", "to": anchor, "loaders": 1.8, "timelapse": 2.8, "label": "Time-lapse" }`
  becomes: from `from` (default `waitStart:<label>`) to `loaders` seconds after `waitStart` at normal
  speed (the loading shimmers are seen), the rest of the wait as a labelled time-lapse of
  `timelapse` film seconds, then normal speed from `waitEnd:<label>` to `to` (the reveal and its hold).
- **Montage**: `{ "montage": ["mark:…", "mark:…"], "lead": -0.05, "beat": 0.625 }` becomes one
  slice per mark, each exactly one beat long on the film clock (37 or 38 frames at 60 fps for a
  0.625 s beat), starting `lead` seconds from the mark. The range before the montage is held a
  little longer so the first slice lands on a beat line counted from film start (the music bed is
  anchored there). A montage cannot open a scene.

### excise and capture gaps

- `"excise": [{ "from": anchor, "to": anchor, "note": "capture stall" }]`: source spans dropped from
  inside kept ranges, snapped outward to the grid. Footage and overlays close up across them (a time
  inside an excised span maps to the first frame after it). An excise overlapping a pointer move
  (`t..tEnd`) or a click (`down..up`) is an error; while the pointer rests (typing, scrolling, waits)
  it is allowed. Inside a time-lapse the pieces keep the range's rate and share one tag.
- **autoExcise** (default on): capture gaps listed in `takesDir/INDEX.md` (the recorder's frozen
  stretches, 100-320 ms) inside kept normal-speed footage are excised when the pointer is at rest. A
  gap that overlaps a move or a click is kept and reported as a warning; cut around it with the
  ranges if it shows. `"autoExcise": false` turns it off for the scene.
- `"holdFrames": [t, …]`: master-clock times of single blank frames (a preview re-mounting on an
  option switch); each is replaced by the last good frame before it.

### pointer

All keys optional. The pointer itself needs no storyboard: every move, click and cursor change in
the kept footage is drawn from the event log.

| Key | Meaning |
|---|---|
| `"show": false` | No pointer in this scene. |
| `"showAt": anchor` / `"hideAt": anchor` | Show later than the scene start / hide before its end. |
| `"enterFrom": "left" \| "right" \| "top" \| "bottom" \| { "x", "y" }` | The scene's first move is drawn from off the frame (just past that edge, in line with the target; or a capture-px point). Use at cuts between takes, where the recorded pointer would jump. |
| `"exit": { "type": "fade" \| "slide", "edge"?, "before"? }` | Takes the pointer off before the cut: `fade` over 0.25 s starting `before` (0.45) s before the end; `slide` off the nearest (or the given) frame edge. Warns if it overlaps a logged move. |
| `"park": [{ "at": anchor, "to": { "x", "y" } }]` | Moves a resting pointer off a tile it would hide; the next logged move starts from the park point. |

### camera

A list of framings, each `{ "at": anchor, … }`. Moves never overlap: one that would start before
the previous lands waits for it.

| Key | Meaning |
|---|---|
| `"box": ref \| [refs] \| {x,y,w,h}` with `"kind": "control"` (default) or `"pane"` | Frame this box: centred on the focus point at the largest scale that fits (pane 92% / control 50% of the frame), clamped to the kind's scale range (pane 1.3-1.5, control 1.3-1.85). |
| `"wide": true` | Back to the whole window. |
| `"scale": n` | Force the scale. |
| `"focus": { "x", "y" }` | Centre the box here instead of (960, 450). |
| `"dur": s` | Move duration (default 0.5 s). `0.001` = cut to that framing. |

Zoomed, the view is clamped so the window covers the frame from the top down to y 900; whenever the
framed window would run past y 930, an ink band fades in over y 900-1080 with the move, so captions
never sit on the UI.

### spotlights

`[{ "box": ref, "start": anchor (default: the box's own event), "end": anchor | "duration": s (1.5) }]`.
The window outside the box dims, a rounded outline traces the box. More than six in a film warns.

### captions

`[{ "text": "...", "at": anchor, "hold": s | "end": anchor, "variant": "wipe" | "words" | "tick", "overCut": false }]`

- Hold defaults to 0.5 s + 0.3 s a word. A caption is clipped 0.1 s before its scene's cut unless
  `"overCut": true`.
- Lint (warnings): at most 10 words, hold at least 0.5 s + 0.3 s a word, no overlap; the film's last
  caption at least 2.5 s.
- Variants cycle when not given. All captions go to one captions track and to `captions.srt`.
- Time-lapse tags move left (down to x 96) to stay 48 px clear of any caption plate on screen; the
  build warns when they cannot.

Optional `"claims": "mark:<label>"` on a caption ties it to what the screen says: every phrase the
caption quotes (`"…"` or `“…”`) must appear in that mark's logged `text` (the recorder logs the
element's visible text on marks). The build ignores the field; `scripts/audit.mjs` checks it and
reports a mismatch as an error. Example: `{ "text": "It says “Worked for 56 s”", "at": …, "claims": "mark:status line" }`.

### exit

| Type | What happens |
|---|---|
| `{ "type": "push", "ref": "down:<control>", "box"? }` | 0.12 s after the click, the camera tracks to the control (0.5 s) and zooms through it (0.35 s); the scene ends at that cut and the next settles in. The kept footage must run past the cut. |
| `{ "type": "whip" }` | Whips out over the last 0.12 s; the next scene whips in. |
| `{ "type": "hard" }` (default) | Hard cut. |

## What the build prints and writes

Every build (and `--dry`) prints a durations table: scene, target, actual, delta, source seconds
excised, subtotals per group, title and end, and the total against `target`. The same numbers go to
`edl.json` `durations`. Warnings follow the table.

| Output | Contents |
|---|---|
| `index.html` | Root composition: title, scene hosts, end card, captions track (left out with `--no-captions`). |
| `compositions/*.html` | One static composition per scene plus `title`, `end`, `captions`. |
| `assets/footage/<scene>.mp4` | The pre-cut clip (ffmpeg trim + setpts per range, concat, constant `clipFps`, H.264 CRF 14, a keyframe every second, no audio); skipped when `<scene>.cut.json` says nothing changed. |
| `cues.json` | `{ fps, duration, captions, cues: [...] }`: clicks (film time one frame after the press, `inTimelapse` when compressed), transitions (title wipe, pushes, whips, hard cuts, end cut, end wipe). The sound build reads it. |
| `edl.json` | `{ fps, clipFps, durations, scenes: [{ id, start, duration, exit, ranges, excised, gapsAccepted }] }`. |
| `captions.srt` | The captions as a sidecar. |

`--dry` writes nothing (no ffmpeg); `--dry-out <dir>` also writes the would-be `cues.json`,
`edl.json` and `captions.srt` there. `--no-cut` reuses the existing clips. Keep a copy of `cues.json`
and `edl.json` beside every render as `<render>.cues.json` / `<render>.edl.json`: the sound build and
the voiceover tools read them.

## Drafting and auditing

**Draft** (`node scripts/draft-storyboard.mjs <take dir or events.json> [...] [--take name] [--out f]`,
default `storyboard.draft.json`): a first-pass storyboard from the takes' event logs, one scene
per take in the order given:

- `ranges`: the take's usable span (`keep:from` / `keep:to` from `take.json` `sync.keep`; else the
  sync flashes, +0.2 / -0.13 s; else the whole video), with every agent wait longer than 4 s as wait
  sugar (loaders 1.8, timelapse 2.8);
- `camera`: every click framed as a control 0.6 s before the press;
- `captions`: a `"TODO: <label>"` placeholder 0.2 s before every click, held until the next one
  (short holds then show in the lint: a sign there are too many);
- `_candidates.spotlights`: every mark with its box (and text, when logged). The build ignores
  `_candidates`; move the ones you want into `spotlights`.
- `target` per scene and for the film: the kept span minus what the time-lapses take out.

Clicks in the compressed part of a wait, or within 0.6 s of the start or 0.5 s of the end, are left
out. The draft builds as is (`node build.mjs storyboard.draft.json --dry`); refining it means
cutting ranges, dropping most framings and placeholders, writing the captions, choosing exits.

**Audit** (`node build.mjs … --audit`, or `node scripts/audit.mjs [storyboard.json] [--takes d]
[--edl f --cues f --srt f] [--hold 1.0] [--jump 120] [--tail 1.0] [--no-holds] [--json]`): reads what
the build wrote and prints one table. Exit 1 on errors only.

| Check | Level | What it finds |
|---|---|---|
| holds | warning | Static stretches longer than `--hold` s: no pointer move, no tween, no UI change in the cut clip (`scripts/holds.py`; needs a real build and numpy; skipped after `--dry`). |
| jump | warning | The pointer jumping more than `--jump` px (stage px at wide framing) at a hard cut between scenes or at a cut inside a scene. Cuts treated by a push, a whip, `pointer.enterFrom`, `pointer.exit` or a hidden pointer, and montage slices, are listed as `ok`. |
| dead air | warning | A caption ends before the next cut, and nothing logged (move, click, typing, scroll, mark, wait end, time-lapse) happens for more than `--tail` s before that cut. |
| captions | warning; overlap is an error | The caption lint: at most 10 words, hold 0.5 s + 0.3 s a word, the last caption 2.5 s, no overlap. |
| claims | error | A caption's quoted phrase is not in its `claims` mark's text (warning when the mark has no text or the caption quotes nothing). |
| edl | error | A scene in `edl.json` that the storyboard does not have (the edl is from another build). |

On the example film the audit reports 0 errors: six cuts with the pointer 339-1080 px apart, all
treated (two pushes, two whips, two `enterFrom`); the other hard cuts measure 0 px (the recorder
chains the pointer from take to take); 18 montage-slice jumps in the format tour, marked `ok`; and
two dead-air warnings (s2, s7).
