# The look

*Mode: reference (the numbers, from `film/lib/config.mjs`). "Banned in this film" and "Honesty" are rules; "Roadmap: 9:16 and 1:1" is planning, not built.*

The design system of a walkthrough film. The numbers are the defaults in `film/lib/config.mjs`;
colours, type, the slant and the lockup come from the project's brand file (`brand.json`), layout numbers
from its `look` section or the storyboard's. The film is a real recording of a real app, framed and
explained. Everything on screen either is the app or points at the app.

## Canvas and ground

- 1920x1080. The film rate is 30 fps by default, 60 when the capture test passes at 60 (the example
  film is 60 fps over 60 fps masters).
- The ground is flat **ink** (`colors.ink`, `#141414` by default): no gradient, no texture, no vignette.
- The app runs in its light theme so the window separates clearly from the ink.

## The window

- Captured at 1440x810 CSS px, 2x density (2880x1620 masters).
- At wide framing it sits at 1536x864, 36 px from the top, centred (x 192), corner radius 16,
  shadow `0 28px 70px rgba(0,0,0,.45)`. Behind the footage: `colors.paper`.
- That leaves a 180 px ink band under the window for captions and the time-lapse tag, so they never
  cover the UI at wide framing.
- Capture px become stage px by `K = 1536 / 1440 = 1.0667`.

## Type

- One family (`font.family`; Roboto by default, which HyperFrames bundles). The font must be
  available where the film renders; render with `--docker` for exact fonts.
- Titles: 92 px, weight 900, tracking -1.5%, line height 1.04, `colors.text`.
- Captions: 44 px, weight 700.
- Time-lapse tag: 28 px, weight 500, `colors.muted`; the speed in `colors.text`, weight 700.
- Nothing below 28 px except the lockup label, which is scaled with its logo.

## Accent

`colors.accent` is the one brand colour. It appears only on the title wipe, the end-card wipe and
the caption tick. Never as a glow, a gradient, a background behind text, or on the pointer. The
lockup is never placed on the accent: the wipes pass over and reveal ink underneath it.

## The lockup

The app's own header lockup, from the brand file: logo (the real file, never redrawn), a hairline
divider, a label ("Content AI" in the example), on a 24-unit row scaled to 84 px on the cards. It
sits left-aligned on the window's left edge (x 192) above the two title lines. Without a logo it is
text: the wordmark (the brand name), the divider and the label. It lands once (blur 10 -> 0, scale
1.06 -> 1, 0.6 s expo.out; divider draws up; label blurs in) and then holds dead still.

## Pointer

The recording has no cursor. The pointer is drawn from the recorder's log, so it can never drift
from the UI.

- 44 px tall at wide framing (4% of the frame height), scaling with the camera (~75 px at 1.7x).
- Black fill, white edge, soft shadow. Three shapes: arrow, pointing hand, I-beam, chosen from the
  CSS cursor the page reported; hover flicker shorter than 0.12 s is dropped.
- Each move follows the recorder's own quadratic arc and ease (verified: worst error 0.001 capture
  px, `film/scripts/verify-pointer.mjs`). Moves chain; the pointer never teleports inside a range.
- Click: press 1 -> 0.86 -> 1 in 0.18 s; a soft disc grows 28 -> 64 px and fades 28% -> 0 in 0.35 s
  under the tip; the click sound lands one frame after the press.

## Camera

Three framings, all from logged element boxes, never guessed pixels:

| Framing | Scale | Use |
|---|---|---|
| wide | 1 | The whole window. Home. |
| pane | 1.3-1.5 (box fills up to 92%) | A panel: the chat, the preview. |
| control | 1.3-1.85 (box fills up to 50%) | One control or one line of text. 1.85 is a 2x capture's pixel limit. |

- A framed box is centred on (960, 450), the middle of the area above the caption band.
- Moves take 0.5 s, `power2.inOut`, arrive just before the pointer needs the control, then hold
  dead still while the UI acts. Moves never overlap.
- Zoomed, the window always covers the frame from the top to y 900; an ink band fades in under it
  whenever it would reach past y 930, so captions stay on ink.
- Push-through: track to control framing 0.5 s, then zoom through the control (until it is ~250% of
  the frame wide) in 0.35 s `power3.in`; the next scene arrives 6% large and settles in 0.6 s.
- Whip: out 0.12 s `power4.in` over 1600 px, in 0.2 s `expo.out` from 1100 px. No blur; the speed
  carries it.

## Spotlight

For pointing at something the pointer is not on (a status line, a saved note). The window outside
the box (+8 px) dims with ink at 25% over 0.25 s; a 3 px rounded outline traces clockwise from the
top-left in 0.55 s; both fade over the last 0.27 s. At most six in a film.

## Captions

- One line at a time, at most **10 words**, bottom centre: the plate spans y 953-1017 (centred at
  985 in the ink band), slanted like the brand's button (`shape.slantDeg`, 16°), plate
  `colors.plate` (ink lifted one step so it reads on the ink band), a small accent tick.
- Each caption is anchored to a logged event, never to typed-in seconds.
- Hold at least **0.5 s + 0.3 s a word**; the film's last line at least **2.5 s**. No overlaps.
  Clipped 0.1 s before its scene's cut unless it is meant to carry over.
- Entrances vary (plate wipe, word by word, tick-led); the exit is one 0.18 s blur-out. Landed
  text never moves.
- A caption says what is visibly true in the take at that moment, or it is cut.

## Eases by role

Arrivals `expo.out`, camera `power2.inOut`, exits `power3.in`. Exits are 40-50% shorter than
entrances.

## Transitions

Four kinds, each caused by something on screen:

1. **Slant wipe** in the accent colour (`shape.wipeSlantDeg`, 20°, led by a thin bar): title and end
   card only. The frame is fully accent for ~0.1 s around the cut.
2. **Camera push** through the clicked control, between app scenes.
3. **Whip**, in a fast montage.
4. **Hard cut**, on the beat inside a montage, or between takes.

## Title and end card

- Title: the real finished outputs from the recording burst onto a full-frame wall (0-1.45 s,
  centre-out), the accent wipe crosses (1.45-2.35, cut 1.9), and under it, on ink, the lockup and two
  lines land at x 192 with a slant-edged column of outputs drifting up on the right. Text blurs out
  over the last 0.3 s for a hard cut to the first scene.
- End card: five outputs deal into a cascade (upright, 640 px tall, one baseline at y 870), the
  accent wipe closes right to left (`end.wipeStart`), then the lockup and the closing line hold at
  least 3 s, the column drifting down.

## Banned in this film

- A dark void with small floating UI.
- Glow.
- Glass cards.
- Everything fading up the same way.
- A title over a dimmed screenshot.
- The logo docked in a corner.
- Bouncing UI.
- Typing as the very first shot.
- Invented screens.

## Honesty

- Agent waits are shown as **labelled time-lapses** (the tag shows the speed for exactly the
  compressed span); the app's own "worked for N s" line, when it has one, shows the true duration.
- Stretches (a still moment held longer) are only used while nothing moves.
- The title wall and the end cascade use only files produced in the recording.
- Nothing is mocked, redrawn or composited into the app. Capture stalls are cut, never painted over
  (the only pixel fix is the 3 px timing-marker cover in the corner, and single blank frames
  replaced by the frame before).
- Every number in a caption or a voice line comes from the code or the recording.

## Roadmap: 9:16 and 1:1

Only 16:9 is built. Portrait and square are not a brand.json switch yet, because the layout is not
one formula: the window, the caption band, the camera's clamp and the title/end cards each carry
their own 16:9 numbers. A preset (`look.aspect`) would have to set all of these, and the cards need
their own layouts rather than scaled ones. The constants that change:

| Where | 16:9 value | What it is |
|---|---|---|
| `look.film` | 1920x1080 | Canvas: 1080x1920 (9:16) or 1080x1080 (1:1). |
| `look.window` | 1536x864 at left 192, top 36, radius 16 | A 16:9 app scaled to the width (e.g. 1008x567 at left 36 in 9:16) leaves most of a portrait frame empty; a portrait film wants a portrait capture (`look.capture`, e.g. a 390x844 phone viewport at 3x) and a window sized to it. |
| `look.capture` | 1440x810 | Must match the recorder's viewport; `K = window.width / capture.width` follows. |
| `look.caption.top` | 953 (plate 953-1017) | The band under the window: `window.top + window.height` + about 53. |
| `look.camera.focus` | (960, 450) | Middle of the area above the caption band. |
| `look.camera.controlScale` | max 1.85 | The capture's pixel limit: capture px x density / window width. |
| `lib/camera.mjs` `bandNeeded` | band at `window.top + window.height` (900), triggers 30 px below | Derived from `WINDOW`; keeps working. |
| `lib/titlecards.mjs` `PANEL.through` | (1510, 700) | Where the slanted column's edge passes the title lines. |
| `lib/titlecards.mjs` `endScene` | cards 640 px tall, baseline y 870, margins 150 | The end cascade. |
| `lib/titlecards.mjs` `titleScene` | 2 rows of 4 creatives, text block at x 192, 64 px gap | The title wall and type block. |
| `build.mjs` tag placement | x >= 96, 48 px clear of the plate | Time-lapse tag in the band. |
| `lib/tag.mjs` `TAG_WIDTH` | 250 | Tag width estimate. |
| `lib/transitions.mjs` `slantWipe` width | 3400 | Panel wide enough to cover the frame while leaning. |
| `look.pointer.size` | 44 (4% of 1080) | Scale with the frame height. |
