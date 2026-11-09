# film: the HyperFrames film kit

Turns recorded takes into a finished walkthrough film. A build script reads a storyboard and the
takes' event logs and writes static, deterministic HyperFrames compositions: the stage (ink ground,
app window, camera), a drawn pointer, spotlights, captions, transitions, the title and end card.
Every component is a plain ES module in `lib/` that returns strings, never touches the DOM, and
emits only `fromTo` / `set` tweens with literal numbers and stable ids.

HyperFrames is pinned at 0.9.16 (`npx --yes hyperframes@0.9.16 …`). `CLAUDE.md` / `AGENTS.md`
are the HyperFrames project instructions (copied into every project); read them before editing
compositions by hand (you should not need to: edit the storyboard, the brand or `lib/`).

## Projects: the kit is never written to

This folder is code. One film lives in a **project folder outside the kit**: it holds the inputs
(`storyboard.json`, `brand.json`, `creatives.json`, `music.json`, `voiceover/`) and receives every
output (`index.html`, `compositions/`, `assets/`, `cues.json`, `edl.json`, `captions.srt`,
`renders/`, `sound-build/`). It is a HyperFrames project of its own, so
`npx hyperframes@0.9.16 check` / `render` run inside it. Installed as a plugin, the kit can sit in a
read-only cache; two films never collide, and a kit update never touches a render.

Every kit command finds the project the same way (`lib/config.mjs`, `PROJECT_DIR`), first match
wins: `--project <dir>`, `FILM_PROJECT=<dir>`, the storyboard's folder when it is a project (has
`hyperframes.json`), the current directory when it holds a `storyboard.json` or `hyperframes.json`,
else the kit's own `film/` (developing the kit itself). `scripts/init-project.mjs` makes a folder a
project; `build.mjs` and `build-demo.mjs` also add any missing project file (`lib/project.mjs`:
`hyperframes.json`, `meta.json`, `package.json` with the pinned scripts, `CLAUDE.md`, `AGENTS.md`,
`.gitignore`, `compositions/`, and `kit.json`, which records where the kit is). Nothing existing is
overwritten. The pointer code imports `../../recorder/motion.mjs` relative to the kit, so it
resolves wherever the project is; keep `film/` and `recorder/` side by side in the kit.

A new film, start to finish (`KIT` = the kit's root folder, `P` = the project, `T` = the takes):

```
node $KIT/film/scripts/init-project.mjs $P                  # HyperFrames project files, brand.json, storyboard.example.json
node $KIT/film/scripts/draft-storyboard.mjs $T/take-1 $T/take-2 --out $P/storyboard.json
cd $P                                                        # from here on the project is the current directory
node $KIT/film/build.mjs --takes $T --dry --audit            # durations table + audit, no files written
node $KIT/film/scripts/sync-assets.mjs                       # logo (brand.json) + creatives (creatives.json) -> assets/
node $KIT/film/build.mjs --takes $T --audit                  # cuts clips, writes index.html, compositions/, cues/edl/captions
npx --yes hyperframes@0.9.16 check --json
npx --yes hyperframes@0.9.16 render -o renders/final.mp4 --fps 60
for f in cues.json edl.json; do cp $f renders/final.$f; done; cp captions.srt renders/final.captions.srt
node $KIT/sound/build-sound.mjs --video renders/final.mp4 --deliver out/my-film.mp4
```

Outside the project, add `--project $P` to each kit command (or set `FILM_PROJECT=$P`).

## Commands

All of these run against the project (above); paths are the kit's.

```
node scripts/init-project.mjs <dir>  # make <dir> a film project (adds only what is missing)
node scripts/draft-storyboard.mjs <take>… --out storyboard.json   # first-pass storyboard from the takes
node scripts/make-placeholder.mjs && node build-demo.mjs   # component demo on stand-in footage, no recording needed
node scripts/sync-assets.mjs        # brand logo + creatives -> <project>/assets/, writes the manifests
node build.mjs [storyboard.json]    # the real build: cuts clips, writes index.html, compositions/,
                                    #   cues.json, captions.srt, edl.json  (--no-cut reuses clips)
node build.mjs --project <dir>      # the project (else FILM_PROJECT, the storyboard's folder, the current directory)
node build.mjs --dry                # mapping + durations table only: no ffmpeg, no files written
node build.mjs --audit              # build, then audit: holds, pointer jumps at cuts, dead air, captions, claims
node build.mjs --dry --audit        # audit the would-be files (no holds check)
node build.mjs --dry --dry-out /tmp/x   # also writes the would-be cues.json, edl.json, captions.srt there
node build.mjs --takes ../takes     # where the take folders are (else WALKTHROUGH_TAKES, storyboard takesDir,
                                    #   <project>/takes, ../takes next to the project)
node build.mjs --brand my.json      # brand file (else FILM_BRAND, storyboard "brand", <project>/brand.json, neutral defaults)
FILM_FPS=60 node build.mjs          # film rate (or "fps" in the storyboard); clips stay at storyboard.clipFps
node build.mjs --no-captions        # voiceover twin: identical film, captions track not mounted
                                    #   (or "captions": false in the storyboard); cues.json records "captions": false
node scripts/verify-pointer.mjs     # drawn pointer vs recorder/motion.mjs, sampled in Chrome
npx --yes hyperframes@0.9.16 check --json            # inside the project
npx --yes hyperframes@0.9.16 snapshot --at 1,4.5,12
npx --yes hyperframes@0.9.16 render -o renders/final.mp4 --fps 60
```

`build.mjs` and `build-demo.mjs` write the same output files; the one run last is what plays.
After every render, copy `cues.json` and `edl.json` beside it as `renders/<name>.cues.json` and
`renders/<name>.edl.json` (and `captions.srt` as `<name>.captions.srt`): the sound build and the
voiceover tools read those, so a later rebuild cannot desync a render you already have.

The storyboard schema is in `docs/STORYBOARD.md`, the design system in `docs/LOOK.md`. Start from
`storyboard.example.json` (three short scenes over `takes/sample`; `init-project.mjs` copies it into the project).

## Brand

Colours, type, the slant, the lockup and the card lines come from a brand file. Every key is
optional; `brand.example.json` shows the whole schema with the neutral defaults, and
`examples/brightpost/brand.json` is a real one. Found as: `--brand <file>`, else
`FILM_BRAND`, else the storyboard's `"brand"` (relative to the storyboard), else `<project>/brand.json`,
else the defaults in `lib/config.mjs`. Paths inside it are relative to the brand file, and
`${NAME}` expands an environment variable (so a brand file can point into another checkout).

| Key | Default | Used for |
|---|---|---|
| `name` | `"Product"` | The wordmark when there is no logo; the logo's alt text. |
| `colors.ink` | `#141414` | Ground, the band under the window, spotlight dim. |
| `colors.paper` | `#F4F2EE` | The window behind the footage. |
| `colors.accent` | `#3D63FF` | The wipes and the caption tick. Nothing else. |
| `colors.text` | `#FFFFFF` | Type on ink. |
| `colors.muted` | `rgba(244,242,238,0.66)` | Lockup label, time-lapse tag. |
| `colors.plate` | `#262626` | Caption plate. |
| `colors.ghost` | `#3c3c3c` | A title line before it lights up. |
| `font.family` / `font.fallback` | `Roboto` / `Helvetica, Arial, sans-serif` | All type. Must be available where the film renders. |
| `font.captionCharEm` | `0.489` | Average caption character width in em, for keeping time-lapse tags clear of caption plates. |
| `shape.slantDeg` | `16` | Lean of the caption plate, its tick and the title/end column edge (the brand's button). |
| `shape.wipeSlantDeg` | `20` | Lean of the wipe panel. |
| `lockup.logo` | `null` | `{ "onDark", "onLight", "aspect" }`: logo files (PNG, JPG or SVG). `scripts/sync-assets.mjs` copies them to `assets/brand/` and measures them. |
| `lockup.label` | `null` | Text after the divider. |
| `lockup.divider` | `true` | The hairline between mark and label (only drawn when both exist). |
| `lockup.wordmark` | `null` (= `name`) | Text used instead of a logo; `""` for none. |
| `lockup.metrics` | 24-unit row: gap 10, divider 1x16 dropped 6, label 14/500/-0.01em dropped 10, wordmark 22/800 | Proportions, scaled to the row height (84 px on the cards). Take them from the app's own header. |
| `cards.title` / `cards.end` | two lines each | Title and end-card lines when the storyboard gives none. |
| `assets.creatives` | `creatives.json` | The creatives file for `sync-assets.mjs`. |
| `look.*` | see `brand.example.json` | Layout numbers: `film`, `capture`, `window`, `camera`, `caption`, `type`, `pointer`. The storyboard's `look` overrides these again for one film. |

**The lockup without a logo** degrades to text, in this order: wordmark + divider + label
("Acme | Studio"), wordmark alone, label alone, or nothing (an empty block, no tweens). With a logo
the divider and label sit low on the row as in an app header; text-only they are centred on it. A
brand that names a logo which was never synced stops the build with "run node
scripts/sync-assets.mjs" rather than silently falling back to text.

## Creatives

The title wall and the end cascade show real outputs from the recording. `creatives.json`
(`{ "sourceDir", "items": [{ "id", "source", "crop"? }] }`; `sourceDir` relative to the file) lists
them in order: title wall first (8), then the title column (`panelItems`, default items 8-10), the
end cascade (default 11-15) and the end column (16-18); indexes wrap. `crop: [x0, y0, x1, y1]`
(fractions) shows only that band in the slanted columns, so the edge never cuts a headline.
`node scripts/sync-assets.mjs` copies them to `assets/creatives/` and writes
`assets/creatives/manifest.json` (`[{ id, src, w, h, crop? }]`). Sizes are read with ffprobe, or an
SVG's viewBox. `make-placeholder.mjs` writes eight flat stand-ins when there is no manifest yet.

## Conventions

- **Units.** Points and boxes from the recorder are capture CSS px (1440x810), `{x, y}` and
  `{x, y, w, h}`. Components convert them. Times are seconds local to the composition being written
  (map source time to film/scene time first; snap with `snap()` from `lib/config.mjs`).
- **Part.** Most components return a part `{ css, html, tl }`; `tl` is a `Timeline` (`lib/emit.mjs`)
  that collects statements. `merge(...parts)` combines parts; `sceneFile({ id, duration, css, html, tl, rootAttrs })`
  writes a `<template>` scene with one paused timeline registered as `window.__timelines[id]`.
- **One setting for frame rate:** `FILM.fps` (`FILM_FPS`, storyboard `fps`, default 30), written to the root's `data-fps`.
- **Seek safety.** `Timeline` adds `immediateRender: false` to every `fromTo` on a selector except the
  earliest one, so seeks before a tween keep the right state (`check` warns otherwise).
- **Ids** are prefixed by the component id you pass (`a-ptr`, `a-ptr-disc-0`, `cap-2-w3`, …).
- **Takes.** `lib/edl.mjs` reads `events.json` with schema `walkthrough-take/1` (`TAKE_SCHEMAS`).
  Anything else stops the build.
  `eventText(take, ref)` returns an event's logged visible text (marks carry it when the recorder
  logged it; `null` otherwise): captions with `"claims": "mark:<label>"` are checked against it by
  the audit.
- **Aspect.** Only 16:9 is built; what a 9:16 or 1:1 preset would have to change is listed in
  `docs/LOOK.md` (Roadmap).
- **The recorder's motion.** `lib/pointer.mjs` and `lib/emit.mjs` import `../../recorder/motion.mjs`
  (the ease and arc the mouse really moved with), and `build.mjs` its `pointerAt`. Keep `film/` and
  `recorder/` side by side.

## lib/config.mjs

Loads the brand and the look (above) and exports: `FILM` (fps, width, height, font, fontStack),
`COLOR` (ink, paper, accent, text, muted, plate, ghost; `white` = text), `CAPTURE` (1440x810),
`WINDOW` (1536x864 at x 192 y 36, radius 16, shadow), `K = WINDOW.width / CAPTURE.width`, `CAMERA`
(ease, moveSeconds, scale ranges pane 1.3-1.5 / control 1.3-1.85, focus point, fill), `CAPTION` (plate
y 953-1017, 44 px / 700, max 10 words, slant, plate colour, charWidth), `TYPE` (title 92 / 900 /
-1.5%; tag 28 / 500), `POINTER` (44 px, fill, edge, disc), `SHAPE` (slant, wipe slant), `EASE`,
`BRAND`, `brandAsset(path)`, `cliArgs()`, `snap(t)` (to the frame grid), `frame()`.

## Stage — lib/stage.mjs

`stage({ id, video: { src, start, duration, mediaStart, rate }, masked: [parts], overlay: [parts], extra: [parts], outside: [parts] }) -> part`

Emits `#<id>-ground` (flat ink), `#<id>-cam` (camera wrapper, full frame), `#<id>-win` (the window,
holding `<video id="<id>-video" class="clip" muted>` at 1536x864), `#<id>-ovl` (same box, not
clipped: the pointer), `#<id>-mask` (clipped to the window radius: spotlights) and `#<id>-band` (the
ink band under the window, faded in by the camera when zoomed). Pointer and spotlights are inside
the camera wrapper, so they move and scale with the screen. `masked` = spotlight parts, `overlay` =
pointer part, `extra` = camera part, `outside` = parts on the frame outside the camera (the
time-lapse tag).

## Time-lapse tag — lib/tag.mjs

`timelapseTag({ id, start, end, label = "Time-lapse", rate, x }) -> part` — fast-forward mark,
the label and the speed (`3×`) in the tag type, muted, in the ink band at x 192 on the caption
centre line; its own clip over the compressed range's film span. `plateWidth(text)` and `TAG_WIDTH`
are the conservative widths the build uses to keep tags 48 px clear of caption plates.

## Camera — lib/camera.mjs

- `framing(box, kind, { scale?, focus? }) -> { scale, x, y }` — kind `"wide" | "pane" | "control"`.
  Centres the box on the focus point (960, 450) at the largest scale that fits (pane 92% / control
  50% of the frame), clamped to the kind's range, then clamps the view so the window covers the
  frame from the top down to y 900: zoomed, the caption band stays ink and never covers the framed UI.
- `boxToCanvas(box)`, `cameraMove({ stage, from, to, at, dur, ease })`, `WIDE`.
- `new Camera({ stage })` keeps the current framing so moves chain:
  - `.frame({ box, kind, at, dur?, scale?, focus? })` — "frame this box" (0.5 s, power2.inOut)
  - `.wide({ at, dur? })`
  - `.pushThrough({ box, at, track = 0.5, through = 0.35, hide: ["#<ptr>-arc"] }) -> cutTime` —
    track to control framing, then zoom through until the control is ~250% of the frame wide with
    its centre travelling to the focus point (power3.in); `hide` fades the pointer as the zoom starts
  - `.settleIn({ at = 0, dur = 0.6, from = 1.06 })` — the next scene arrives 6% large and settles
  - `.whipOut({ at, dir = -1, dur = 0.12 })` (power4.in, 1600 px), `.whipIn({ at, dir = -1, dur = 0.2, from = 1100 })`
    (expo.out). No blur; the speed carries it. `whipIn` also emits a `set` of its from-state at its
    start, so the first frame already shows the incoming offset (a fromTo is not drawn at exactly
    its start time when the previous state differs)
  - `.part()` -> part (timeline only)

## Pointer — lib/pointer.mjs

44 px tall at wide framing (scales with the camera, ~75 px at 1.7x). Black fill, white edge, soft
shadow (`look.pointer`). Three SVG shapes: `arrow`, `hand`, `ibeam`; hotspot at the element origin.

- `pointerMove({ id, from, to, start, end?, control? }) -> Timeline` — the quadratic arc
  `bezier(from, control, to, ease(progress))` exactly as the recorder moved the mouse. `control`
  defaults to the recorder's `controlPoint(from, to)` (8% of the distance, perpendicular, bowing up);
  pass the logged one. `end` defaults to `start + moveDuration(from, to)`. Built as a chord tween on
  `#<id>` plus a sideways bulge on `#<id>-arc` (two monotone halves), so it is plain seekable GSAP.
  The ease is the recorder's own `power3InOut` from `recorder/motion.mjs`, embedded at build time
  (`HF.p3`). Verified: `scripts/verify-pointer.mjs`, worst error 0.001 capture px over 210 samples.
  Moves must chain (`from` = the previous `to`), or the pointer teleports at the start of a move.
- `pointerClick({ id, at, point, disc }) -> part` — `at` = mouse-down. Press scale 1 -> 0.86 -> 1 in
  0.18 s; a disc (its own clip `#<id>-disc-<n>`) grows 28 -> 64 px and fades 28% -> 0 in 0.35 s.
- `pointerShape({ id, at, shape })`, `shapeForCursor(cssCursor)` (`pointer` -> hand, `text` -> ibeam).
- `pointerShow / pointerHide({ id, at })`, `pointerPlace({ id, at, point })`, `pointerMarkup({ id, shape })`.
- `new Pointer({ id, point, shape })` keeps position, shape and disc count:
  `.show(at)`, `.hide(at)`, `.move({ to, start, end?, control? })`, `.click({ at })`,
  `.shape({ at, shape })`, `.part()`.
- Re-exports `MOTION`, `moveDuration`, `controlPoint` from the recorder.

## Spotlight — lib/spotlight.mjs

`spotlight({ id, box, start, end, pad = 8, radius = 10, dim = 0.25, color = ink, stroke = 3 }) -> part`

Its own clip over `[start, end)`. The window outside the box (+8 px) dims with ink at 25% (0.25 s
in), a 3 px rounded outline traces clockwise from the top-left (0.55 s), both fade out over the last
0.27 s. Goes in the stage's `masked` list.

## Captions — lib/captions.mjs

- `captionsScene({ id = "captions", duration, items: [{ text, start, end, variant? }] }) -> scene file`
  — one captions composition (mount it with `data-track-kind="captions"`), each caption its own clip
  `#cap-<i>` (hard-hidden outside its span, plus a `set visibility:hidden` at its end). Slanted plate,
  accent tick, 44 px bold, centred, plate y 953-1017 (centre 985). Variants (default cycles):
  `"wipe"` plate wipes open + line blurs in; `"words"` word by word blur-in; `"tick"` the tick leads,
  the plate grows from it, words come up. Exit: 0.18 s blur-out (power3.in). Landed text never moves.
- `captionsPart(items) -> part`, `captionHold(text, last)`, `lintCaptions(items) -> [problems]`
  (word count, hold time, overlap), `toSrt(items) -> string` (the sidecar from the same data).

## Transitions — lib/transitions.mjs

- `slantWipe({ id, start, dur = 0.9, dir = 1, width = 3400 }) -> part & { cut }` — accent panel
  leaning "/" (`shape.wipeSlantDeg`) led by a thin bar, power2.inOut; the frame is fully accent
  ~0.1 s around `cut` (start + dur/2): swap what is underneath there.
- Camera push: `Camera.pushThrough` + `Camera.settleIn`. Whip: `Camera.whipOut` + `whipIn`.
- Hard cut: two scene hosts back to back.

## Title and end card — lib/titlecards.mjs, lib/lockup.mjs

- `titleScene({ id = "title", creatives, lines, duration = 8, panelItems = [8, 9, 10] }) -> scene file`
  — 0-1.45 s the creatives burst onto a full-frame wall (two rows at their own aspect, centre-out);
  accent slant wipe 1.45-2.35 (cut 1.9); under it, ink, the lockup and lines at x 192 and the slant
  column on the right; line 1 word by word (blur), line 2 as a ghost then word by word to white;
  holds; text blurs out over the last 0.3 s for a hard cut to the stage.
- `slantPanel({ id, items, start, end, dir }) -> part` — the right-hand column: left edge leaning
  "/" at `shape.slantDeg` ~85 px clear of the longest title line, frame edge on the right,
  creatives stacked at full brightness drifting at a constant 42 px/s (up on the title, down on the
  end card). A designed panel beside the type, never behind it.
- `endScene({ id = "end", creatives, lines, duration = 7, panelItems, cascadeItems, wipeStart = 2.4 }) -> scene file` —
  five outputs deal into a cascade (upright, 640 px tall, bottoms on one baseline at y 870, even
  step, each over the last), slow push; the accent slant closes right to left at `wipeStart` (cut
  +0.45); lockup and the closing lines (landed by ~1 s after the cut, then held) and the slant
  column drifting down.
- `lockup({ id, logoHeight, x, y, tone }) -> { css, html, k, width, height, parts }`,
  `lockupIn({ id, at })`, `lockupOut({ id, at, dur })`, `lockupParts()`, `logoFiles()` — see Brand.

## Scripts

| Script | What it does |
|---|---|
| `scripts/draft-storyboard.mjs <take>… [--take n] [--out f]` | First-pass storyboard: one scene per take, keep span, agent waits as time-lapses, a framing and a `TODO` caption per click, marks as `_candidates.spotlights` (docs/STORYBOARD.md, Drafting). |
| `scripts/audit.mjs [storyboard] [--takes d] [--edl f --cues f --srt f] [--hold s] [--jump px] [--tail s] [--no-holds] [--json]` | Holds, pointer jumps at cuts, dead air after captions, caption lint, caption claims against mark text; exit 1 on errors only (also `build.mjs --audit`). |
| `scripts/init-project.mjs <dir>` | Make `<dir>` a film project: HyperFrames files, `kit.json`, `brand.json`, `storyboard.example.json` (adds only what is missing). |
| `scripts/sync-assets.mjs [--project d] [--brand f] [--creatives f]` | Logo + creatives into `<project>/assets/`, manifests. |
| `scripts/make-placeholder.mjs [seconds] [--creatives]` | Stand-in footage (+ stand-in creatives when there are none) for `build-demo.mjs`. |
| `scripts/verify-pointer.mjs` | Drawn pointer vs the recorder's curve in headless Chrome (needs `playwright-core`). |
| `scripts/holds.py [min_s] [storyboard.json] [--takes dir]` | Dead holds: stretches with no pointer move, no tween and no UI change (needs the cut clips and the built compositions; run from the project). |
| `scripts/scene-sheets.py <video> <edl.json> <outdir> [fps] [width]` | One contact sheet per scene of a render, labelled with film time. |
| `scripts/list-events.py <take dir>…` | A take's events as a table: the labels refs are written with. |
| `scripts/cadence.py <video> <t0> <t1> <w:h:x:y>` | Frame-change cadence of a crop (30 fps clips in a 60 fps film must change every 2nd frame). |
| `scripts/align-frames.py <clip> <master> <clipT:masterT>…` | How many master frames a cut clip is off at given moments. |

## Files

- `lib/` components and `lib/edl.mjs` (refs, anchors, mapping); `build.mjs` + a storyboard: the
  real build; `build-demo.mjs` + `demo/targets.mjs`: the placeholder demo.
- `lib/project.mjs`: what makes a folder a project (`ensureProject`).
- Generated into the project (and git-ignored there by the `.gitignore` the project gets):
  `index.html`, `compositions/*.html`, `cues.json`, `captions.srt`, `edl.json`, `assets/footage/`,
  `assets/brand/`, `assets/creatives/`, `renders/`, `review/`, `sound-build/`, `assets/audio/`,
  `.hyperframes/` — edit the storyboard, the brand or the generators, not these. When developing in
  the kit's own `film/`, the same files land here and the same ignore list applies.
