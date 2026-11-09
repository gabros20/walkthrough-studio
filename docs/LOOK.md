# The look

*Mode: reference (the numbers, from `film/lib/config.mjs`). "Banned in this film" and "Honesty" are rules. The sections up to "Aspect presets" give the 16:9 numbers; "Aspect presets" gives the rules and the derived numbers for 9:16 and 1:1, and the phone bezel.*

The design system of a walkthrough film. The numbers are the defaults in `film/lib/config.mjs`;
colours, type, the slant and the lockup come from the project's brand file (`brand.json`), layout numbers
from its `look` section or the storyboard's. The film is a real recording of a real app, framed and
explained. Everything on screen either is the app or points at the app.

## Canvas and ground

- 1920x1080 at 16:9 (the default); 1080x1920 at 9:16, 1080x1080 at 1:1 (`look.aspect`, see "Aspect
  presets"). The film rate is 30 fps by default, 60 when the capture test passes at 60 (the example
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
divider, a label ("Brightpost" in the example), on a 24-unit row scaled to 84 px on the cards. It
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

## Aspect presets

`look.aspect` in the brand file (or the storyboard's `look`, or `--aspect` on the build, or
`FILM_ASPECT`; the command line wins) is `"16:9"` (default), `"9:16"` or `"1:1"`. `film/lib/config.mjs`
derives every layout number from the aspect and from the take: the first scene's `events.json`
`viewport` and `scale`. Every take in one film must share that viewport; the build stops when one does
not. Any derived number can still be set in a `look` section (`film`, `capture`, `window`, `band`,
`camera`, `caption`, `tag`, `type`, `pointer`, `wipe`, `cards`), but then it no longer follows the aspect.

**16:9 over a desktop take keeps the fixed numbers above, unchanged** (the golden test proves the
output is byte-identical). Everything else uses these rules, with `s = min(width, height) / 1080` (1 for
all three presets):

- **Band.** The ink band at the bottom holds the captions and the time-lapse tag: 180 px (16:9),
  220 (1:1), 340 (9:16), times `s`. Zoomed framings keep the window covering the canvas down to the
  band's top (`band.top`); the ink band fades in over the footage when a framing reaches 30 px past it.
- **Window.** The capture's own aspect, fitted into the area above the band inside side margins of 10% of
  the width and a top margin of height / 30 (16:9: 192 and 36, which gives today's 1536x864), centred in
  that area. A phone bezel is part of the fit. The window never reaches into the band. Corner radius:
  16 x (window width / 1536), at least 8; on a phone take 14% of the width / 2.4 (the bezel's outer
  radius is 2.4 x this).
- **Camera.** Focus at (width / 2, band top / 2). The control scale is capped at the capture's pixel
  limit, master width / window width less 1.3%, at most 1.85; the low end of both ranges is 1.3 (or the
  cap, if lower). Whips travel 1600 / 1100 px at 16:9, scaled with the width.
- **Captions.** 44 px type, 64 px plate (times `s`). At 9:16 and 1:1 a caption wider than 92% of the
  canvas wraps into two balanced lines (decided at build time from the character-width estimate, so it is
  deterministic), on a taller plate with the tick centred; the caption lint warns at more than two lines.
  The plate's top is band top + 80 (one line ends 64 px lower, two lines 116). At 16:9 a caption never
  wraps.
- **Time-lapse tag.** At 16:9 beside the plate, 48 px clear of it, never left of x 96. At 9:16 and 1:1 on
  its own row above the caption (centre line at band top + 40), from the window's left edge, so tag and
  caption never overlap.
- **Pointer.** 44 px, but never larger against the app than at 16:9 (41.25 CSS px of the capture).
- **Wipe.** The panel is wide enough to cover the frame while leaning: width + 2 x tan(wipe slant) x
  height + 36% of the width (3400 at 16:9).
- **Title and end cards.** 16:9 is the **side** layout described above. 9:16 and 1:1 are **stacked**:
  the lockup (64 px row) on top at x = 8% of the width, the two lines under it (72 px, each wrapped to the
  width when it would not fit, 44 px gap), centred in the area above a strip of creatives along the
  bottom that drifts sideways at 42 px/s (left on the title, right on the end card). The title wall has 4
  rows at 9:16 and 3 at 1:1 (cropped top and bottom when taller than the frame). The end cascade is 40%
  (9:16) or 50% (1:1) of the height, inside 8% margins; cards shrink until the widest ends inside the
  right margin.

**9:16 needs a portrait take.** Record with `viewport: "phone"` (390x844 CSS px at 3x, a 1170x2532
master). With a landscape take the build stops: "9:16 needs a phone-preset take; record with viewport:
phone". `look.allowLetterbox: true` places the landscape window anyway, scaled to the width inside the
margins, centred with ink above and below. **1:1** takes both orientations.

### Derived numbers

| | 16:9, desktop take | 9:16, phone take | 1:1, desktop take | 1:1, phone take |
|---|---|---|---|---|
| Canvas | 1920x1080 | 1080x1920 | 1080x1080 | 1080x1080 |
| Capture (CSS px, scale) | 1440x810, 2 | 390x844, 3 | 1440x810, 2 | 390x844, 3 |
| Window | 1536x864 at (192, 36), r 16 | 678x1467 at (201, 89), r 40 | 864x486 at (108, 205), r 9 | 368x796 at (356, 50), r 21 |
| K (stage px per capture px) | 1.0667 | 1.7385 | 0.6 | 0.9436 |
| Bezel | none | 24 px, outer r 96, inner r 72 | none | 13 px, outer r 50, inner r 37 |
| Band top | 900 | 1580 | 860 | 860 |
| Caption plate top | 953 (one line) | 1660 (up to two lines, max 994 wide) | 940 (two lines, 994) | 940 (two lines, 994) |
| Tag | beside the plate, centre y 985 | own row, centre y 1620, x 201 | own row, centre y 900, x 108 | own row, centre y 900, x 356 |
| Camera focus | (960, 450) | (540, 790) | (540, 430) | (540, 430) |
| Control scale | 1.3-1.85 | 1.3-1.7 | 1.3-1.85 | 1.3-1.85 |
| Pointer | 44 | 44 | 25 | 39 |
| Wipe panel | 3400 | 2866 | 2255 | 2255 |
| Cards | side: lockup 84, title 92 | stacked: lockup 64, title 72, strip 518 tall, wall 4 rows, cascade 768 | stacked: strip 324, wall 3 rows, cascade 540 | as 1:1 desktop |

A landscape take letterboxed in 9:16 (`allowLetterbox`) gets an 864x486 window at (108, 579) and a 25 px pointer.

### Phone bezel

When the take is a phone preset (viewport at most 500 CSS px wide, scale 2 or more), `lib/stage.mjs`
draws a neutral device frame around the footage, inside the camera wrapper so it moves with every
framing:

- the bezel is 3.5% of the window width on each side, its outer corner radius 2.4 x the window radius;
- body `#0B0B0B`, a 2 px ring in the plate colour (`colors.plate`) on its edge, carrying the window's
  shadow; no notch, no buttons, no brand marks;
- the footage is clipped to the inner radius (outer minus the bezel), and so are the spotlights; the
  pointer stays in the overlay as at 16:9.

Its size comes from `events.json` `viewport` and `scale`, never from a fixed 1170x2532. `look.bezel:
false` turns it off, `true` forces it on any take, and an object (`thickness`, `outerRadius`, `body`,
`ring`, `ringWidth`) changes its parts.
