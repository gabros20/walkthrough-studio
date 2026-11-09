---
version: alpha
name: walkthrough-studio site
description: >-
  Landing page for walkthrough-studio, a Claude Code plugin that turns a logged Playwright take of any
  web app or website into a Screen-Studio-style walkthrough film. The page borrows the film's own
  grammar (ink, the window, the slant, the keying-green sync flash) and inverts it: the film puts a
  light app window on ink; the page puts ink film windows on a light studio-grey ground.
colors:
  primary: "#141414"
  ink: "#141414"
  plate: "#1F1F1F"
  ink-line: "#2E2E2E"
  cyc: "#E3E6E2"
  cyc-deep: "#D3D7D2"
  white: "#FFFFFF"
  text: "#141414"
  muted: "#4A4F4B"
  muted-on-ink: "#A3A8A4"
  key: "#00B140"
  key-ink: "#141414"
typography:
  display-xl:
    fontFamily: Archivo
    fontSize: 5.5rem
    fontWeight: 800
    lineHeight: 0.98
    letterSpacing: -0.02em
    fontVariation: '"wdth" 112'
  display-lg:
    fontFamily: Archivo
    fontSize: 3.5rem
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: -0.015em
    fontVariation: '"wdth" 112'
  heading:
    fontFamily: Archivo
    fontSize: 1.5rem
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: -0.005em
    fontVariation: '"wdth" 104'
  body-lg:
    fontFamily: Archivo
    fontSize: 1.25rem
    fontWeight: 400
    lineHeight: 1.5
    fontVariation: '"wdth" 100'
  body:
    fontFamily: Archivo
    fontSize: 1.0625rem
    fontWeight: 400
    lineHeight: 1.6
    fontVariation: '"wdth" 100'
  caption:
    fontFamily: Archivo
    fontSize: 1.125rem
    fontWeight: 700
    lineHeight: 1.2
    fontVariation: '"wdth" 100'
  mono:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.02em
rounded:
  window: 16px
  control: 6px
  none: 0px
components:
  button-primary:
    backgroundColor: "{colors.key}"
    textColor: "{colors.key-ink}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    padding: 14px 28px
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
  caption-plate:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.white}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    padding: 10px 28px
  code-block:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    typography: "{typography.mono}"
    rounded: "{rounded.control}"
    padding: 20px 24px
  film-window:
    backgroundColor: "{colors.ink}"
    rounded: "{rounded.window}"
---

# walkthrough-studio site

## Overview

Register: **design is the product** (a landing page), but the audience is developers who will read
the proof, so the page is sequenced: a restrained hero with the film playing, then progressively
denser and literal proof (file names, flags, the one mapping formula, real JSON), then a copyable
quick start. Every claim is checkable against the repo.

The reference is **an editing bay's screening wall**, not a terminal: a light, neutral studio-grey
ground (a photo studio's seamless "cyc" paper, not cream) on which the films sit in ink windows
with the film's own shadow. The page inverts the film (film: light app window on ink; page: ink
film window on light grey) and speaks the film's grammar: the window, the 16° slant of the caption
plate, the 20° slant of the wipe, the drawn pointer, the keying-green sync flash.

**The signature: the slant.** Wherever a template would have a horizontal rectangle edge at a
moment of transition, the page leans like the film's wipe: the joins between grey and ink bands
are cut at 20° and led by a thin keying-green bar (the film's "wipe led by a thin bar"), and the
hero's key line sits on a slanted caption plate with a green tick, exactly as a caption sits in
the film. Nothing else on the page leans. Everything else is square, quiet and dense.

## Colors

- **ink `#141414`**: the film's own `colors.ink`. Body text on grey; the ground of ink bands, film
  windows and code blocks.
- **plate `#1F1F1F`**: ink lifted one step, as in the film; caption plates and code inside ink bands.
- **ink-line `#2E2E2E`**: hairlines and table rules on ink.
- **cyc `#E3E6E2`**: the page ground. A cool, neutral studio grey (hue sits in the green-grey, well
  outside the cream band). **cyc-deep `#D3D7D2`**: table stripes, rules, the placeholder slot.
- **white `#FFFFFF`**: text on ink; inline code chips on grey.
- **muted `#4A4F4B`** on cyc (6.6:1) and **muted-on-ink `#A3A8A4`** on ink (7.6:1): secondary text.
- **key `#00B140`**: chroma-key green, the colour of the recorder's three 100 ms sync flashes. The
  one accent. Used only as a *fill* (the wipe bar on slanted joins, the caption tick, the primary
  button, the copied-state flash) or as text **on ink** (6.5:1). Never as text on cyc (2.2:1), never
  as a glow, a gradient or a large background behind body text.

Rhythm: cyc → ink → cyc → ink, with the ink bands reserved for "the film" (the result, quality
gates) and the grey for "the kit" (how it works, modes, agents, quick start).

## Typography

One family, as the film itself uses one family: **Archivo** (variable, `wght` + `wdth`), loaded
with `next/font/google`. Display runs **expanded** (`wdth` 112, weight 800, tracking −0.02em) so the
headlines have the heavy, wide feel of a title card; body runs at normal width, weight 400. The
utility face is **JetBrains Mono** for commands, file names, flags, timecodes and table data.

Scale (fluid only for display; body is fixed rem): display-xl `clamp(2.75rem, 6vw, 5.5rem)`,
display-lg `clamp(2rem, 4vw, 3.5rem)`, heading 1.5rem, body-lg 1.25rem, body 1.0625rem, mono
0.875rem, label 0.8125rem. Reading measure 62ch. Sentence case everywhere. No uppercase eyebrows.

## Layout

12-column grid inside a 1240px shell (`max-w-[77.5rem]`), 24px gutters, 16px side padding on phone,
40px from 768px. Section padding `py-24` on phone, `py-36` on desktop; one spacing scale (Tailwind's
4px base). The hero is asymmetric: headline column (7/12) left, the film window bleeding right.
Proof sections alternate a wide visual with a dense, left-aligned text column; tables run full shell
width. Slanted joins are a `clip-path` band between sections (`.join`, height
`clamp(2.5rem, 6vw, 5.5rem)`, so the edge rises gently across the full width) with a 6px key-green bar
on the same edge, mirrored on ink → grey joins.

## Elevation & Depth

Two planes everywhere: the ground and the film window. The window carries the film's own shadow,
`0 28px 70px rgba(0,0,0,.45)` on ink, and on cyc a lighter `0 24px 60px rgba(20,20,20,.28)`. No
other shadows. No glass, no blur, no glow, no gradients (the film bans all four).

## Shapes

Film windows: 16px radius (the film's window radius). Code blocks and inputs: 6px. Buttons, caption
plates and table cells: square, with the plate slanted 16° via `skewX(-16deg)` on a wrapper and the
text counter-skewed. Nothing above 16px radius.

## Components

- **Film window**: ink frame, 16px radius, film shadow; holds a `<video autoplay muted loop
  playsinline poster>` or, before the visual exists, a placeholder that reads "visual rendering".
  `prefers-reduced-motion` shows the poster only.
- **Caption plate**: slanted ink plate, white bold text, a 6px key-green tick on its left edge.
  Used for the hero's key line only.
- **Code block**: ink, mono, a copy button that flashes key-green with "Copied" for 1.2 s.
- **Primary button**: key-green fill, ink text, square; hover inverts to ink with white text.
- **Spec table**: mono cells, cyc-deep rules, no zebra boxes on ink.

## Motion

Eases by role, from the film: arrivals `cubic-bezier(0.16, 1, 0.3, 1)` (expo.out), exits
`cubic-bezier(0.55, 0, 1, 0.45)` (power3.in) at 40–50% of the entrance duration. One orchestrated
moment: the hero's caption plate wipes in (clip from left, 0.6 s) after the headline lands. Below
the fold, nothing animates on scroll except the videos, which only play when visible. All motion
off under `prefers-reduced-motion`.

## Do's and Don'ts

- Do quote real file names, flags and numbers from the repo (`build.mjs --audit`, `events.json`,
  `--no-captions`, 3:02, 60 fps, 7 skills, 9 agents). Do drop any claim the repo cannot back.
- Do keep key green to fills and to text on ink. Don't put it on cyc text, as a glow, or as a
  gradient.
- Do use the slant only on band joins and the hero plate. Don't slant cards, images or buttons.
- Don't use cream, terracotta, purple/indigo gradients, gradient text, eyebrow chips, 01/02/03
  markers, three identical feature cards, icon-tile grids, glass, or radius above 16px.
- Don't number anything unless the content is a real ordered sequence (the pipeline is one).
- Don't show the film window as "a dark void with small floating UI": it always fills its column.
