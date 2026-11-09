---
name: build-film
description: Cut a walkthrough or tour film from recorded takes (studio or site mode) with the HyperFrames film kit - a first-pass storyboard drafted from events.json, refined by hand (event-anchored ranges, time-lapses, slow-downs, excises, camera framings by element box, spotlights, captions anchored to events, transitions), build.mjs, dry runs, draft renders, the build audit (holds, pointer jumps at cuts, caption lint and truth), picture lock, and the captioned and --no-captions twins from one lock. Use after takes exist, after review rulings, and when timing must change.
---

# Build the film

The film editor (`agents/film-editor.md`, Opus) does this work. You give it the takes, the plan and the
rulings, and you rule on what it reports.

Read: `docs/STORYBOARD.md` (format), `docs/LOOK.md` (numbers, banned list), `film/README.md`, the `hyperframes`
skill. Example: `examples/kleber-content-ai/storyboard.json`, `brand.json`, `creatives.json`, `captions.srt`.

## Inputs

- `takes/INDEX.md` and the take folders (`master.mp4`, `events.json`, `take.json`).
- The plan's story table and honesty rules; `brand.json` (colours, font, lockup with the real logo files);
  `creatives.json` (real outputs from the recording for the title burst and end card). A site tour or an app
  that makes no images has no outputs: use 8 or more stills of the toured pages, cut from the takes with
  `ffmpeg -ss <s> -i <take>/master.mp4 -frames:v 1 <dir>/<n>.png`, and list those (still real footage;
  `make-placeholder.mjs` stand-ins are for drafts only).

## Steps

All commands run from `film/` (the film project is `film/` itself). Takes resolve from `--takes`, else
`WALKTHROUGH_TAKES`, else the storyboard's `takesDir`; brand from `--brand`, else `FILM_BRAND`, else the
storyboard's `brand`, else `film/brand.json` (schema in `film/brand.example.json`); frame rate from
`FILM_FPS` or the storyboard's `fps`.

- [ ] Brand assets: `node scripts/sync-assets.mjs --brand <project>/brand.json [--creatives <file>]` (copies the real logo
  files into `film/assets/brand`, git-ignored).
- [ ] **Draft (required).** `node scripts/draft-storyboard.mjs <take dir> [<take dir> ...] [--take name]
  --out storyboard.draft.json`: one scene per take in the order given; every click becomes a camera framing
  and a caption placeholder, every long wait a time-lapse range. It builds as is
  (`node build.mjs storyboard.draft.json --dry`). Never write a storyboard from zero;
  `film/storyboard.example.json` shows the full format.
- [ ] **Refine** the draft against INDEX.md and the plan: kept ranges as event references (`"click:send"`,
  `"mark:options#2"`), time-lapses over waits (loader shown at normal speed first, labelled), slow-downs only
  where the moment is the point (untagged), excises over listed capture stalls, camera framings by marked
  element, spotlights (at most about six), captions anchored to events and written from the marks' visible
  text (give each caption that quotes the UI `"claims": "mark:<label>"`, so the audit checks every quoted
  phrase against that mark's logged text), scene exits (push, whip, wipe, hard cut). Size holds for the chosen twin: reading time for captions,
  speech time for a voiceover, the slower of the two when both twins are wanted.
- [ ] `cd film && node build.mjs <storyboard.json> --takes <dir> --brand <brand.json> --dry`: read the
  durations table; adjust until the total is in range (3:00-3:15 worked).
- [ ] Build and render a draft in the foreground: `node build.mjs ...`, then
  `npx --yes hyperframes@0.9.16 check --json` and `npx --yes hyperframes@0.9.16 render -o renders/<name>.mp4 --fps 60`;
  copy the build's `edl.json`, `cues.json` and `captions.srt` beside it as `<name>.edl.json`,
  `<name>.cues.json`, `<name>.captions.srt`. `python3 scripts/list-events.py <take dir>` lists a take's
  anchorable events.
- [ ] Look: `python3 scripts/scene-sheets.py <render> <edl.json> <outdir> 1 480` per scene; strips around cuts.
  Fix pointer jumps at hard cuts (fade/slide off and back in, end on a punch-in, or a push/whip at a story
  break; vary the treatment), the heartbeat pixel in zoomed top-left framings, captions over tags.
- [ ] Review loop (skill `review-film`) until the must-fix list is empty.
- [ ] **Audit (required before every review and before lock).** `node build.mjs <storyboard.json> --audit`
  after a build (`--dry --audit` checks the would-be files without the holds check), or standalone
  `node scripts/audit.mjs [storyboard.json] [--takes d] [--edl f --cues f --srt f] [--hold 1.0] [--jump 120]
  [--tail 1.0] [--no-holds] [--json]`. It checks frozen holds, pointer jumps at cuts, dead air after a caption,
  caption lint and caption claims. Exit 1 means errors (caption overlap, a claim mismatch, an edl from
  another build): fix them. Warnings: fix or justify each one in the report. `python3 scripts/holds.py 1.0`
  gives the detailed hold list.
- [ ] Picture lock: final render `renders/final.mp4` with its sidecars; hand to the sound designer, whose
  `--deliver` renames it `final.picture-only.mp4` so the silent picture can never pass for the film.
- [ ] Twins from one lock: if the owner chose captions, voiceover or both, render each from the same locked
  storyboard: the captioned film normally, the voiceover twin with `--no-captions` to `renders/final-vo.mp4`
  with its own sidecars, identical timing to the frame. Never re-cut one twin alone.
- [ ] Re-timing after the voiceover is placed: `node build.mjs ... --dry --dry-out <dir>`, send the dry-run
  `edl.json`/`cues.json` and an old-versus-new table to the voiceover producer, render only after it says
  "all lines fit".

## Verification

`hyperframes check` zero errors; `--audit` clean or every finding justified; durations in range; every click frame shows the clicked
control in frame; captions true to their frames; the critic's must-fix list empty.

## Outputs

`film/renders/<name>.mp4` (renamed `<name>.picture-only.mp4` at delivery) with `<name>.edl.json`,
`<name>.cues.json`, `<name>.captions.srt`;
per-scene sheets; the editor's durations table and flaw list.

## Pitfalls

- Renders started in the background and never reported (E8): foreground only.
- Rendering while takes record (C3): code and `--dry` only until "recording finished".
- Camera on the wrong box (E1), long frozen holds (E2), pointer jumps (E3), a key line too brief (E4).
- A caption whose claim is not visible (E5): cut it or fix the app.
- Re-timing after VO placement without a fit check (E9) costs a second render.
