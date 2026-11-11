---
name: build-film
description: Cut a walkthrough or tour film from recorded takes (studio or site mode) with the HyperFrames film kit and the walkthrough CLI (draft, captions, build, audit, render) - a first-pass storyboard drafted from events.json, refined by hand (event-anchored ranges, time-lapses, slow-downs, excises, camera framings by element box, spotlights, captions anchored to events, transitions), captions written by an agent from a tool brief and checked against marked text, automatic pointer bridges and fades at cuts, 16:9, 9:16 or 1:1 aspect with a phone bezel, dry runs, draft renders, the build audit (holds, pointer jumps, caption lint and truth), script-first timing (--fit-audio) for voice-led films, picture lock, and the captioned and --no-captions twins from one lock. Use after takes exist, after review rulings, and when timing must change.
---

# Build the film

The film editor (`agents/film-editor.md`, Opus) does this work (or, without sub-agents, you do that role's
checklist yourself: see `agents/film-editor.md` in the kit). You give it the takes, the plan and the
rulings, and you rule on what it reports.

Read: `docs/STORYBOARD.md` (format, pointer at cuts, script-first timing), `docs/LOOK.md` (numbers, aspect
presets, banned list), `docs/CAPTIONS.md`, `$KIT/film/README.md`, `docs/CLI.md` (`draft`, `captions`, `build`,
`audit`, `render`), the `hyperframes` skill. Example: `examples/brightpost/storyboard.json`, `brand.json`, `creatives.json`, `captions.srt`.

**Where the kit is.** `KIT` is the walkthrough-studio checkout; kit paths (`recorder/`, `film/`, `docs/`,
`agents/`, ...) are relative to it. Use the first of these that holds `recorder/` and `film/`:
`${CLAUDE_PLUGIN_ROOT}` (Claude Code or Codex plugin install; skip it if it shows unexpanded),
`$WALKTHROUGH_STUDIO_HOME`, `~/walkthrough-studio`, this skill's own `../..`. If none does, the install copied
only this file (skills.sh): ask the user to run
`git clone https://github.com/gabros20/walkthrough-studio ~/walkthrough-studio && cd ~/walkthrough-studio && npm run setup`.
Without sub-agents (most platforms other than Claude Code), do each named agent's role yourself from
`$KIT/agents/<name>.md`.

## Inputs

- `takes/INDEX.md` and the take folders (`master.mp4`, `events.json`, `take.json`).
- The plan's story table and honesty rules; `brand.json` (colours, font, lockup with the real logo files);
  `creatives.json` (real outputs from the recording for the title burst and end card). A site tour or an app
  that makes no images has no outputs: use 8 or more stills of the toured pages, cut from the takes with
  `ffmpeg -ss <s> -i <take>/master.mp4 -frames:v 1 <dir>/<n>.png`, and list those (still real footage;
  `make-placeholder.mjs` stand-ins are for drafts only).

## Project folder

The kit is read-only while you use it. A **project folder** outside the kit holds the inputs
(`storyboard.json`, `brand.json`, `creatives.json`, `music.json`, `voiceover/`) and receives every output
(`index.html`, `compositions/`, `cues.json`, `edl.json`, `captions.srt`, `renders/`, `sound-build/`, `out/`).
Below, `KIT` is the kit root, `P` the project folder and `T` the takes folder.

- Scaffold: `node $KIT/film/scripts/init-project.mjs $P`. It refuses a folder inside the kit. Any folder also
  becomes a project on its first build; nothing existing is overwritten.
- Project lookup, first match wins: `--project <dir>`, `FILM_PROJECT`, the storyboard's folder if it has
  `hyperframes.json`, the current folder if it has `storyboard.json` or `hyperframes.json`, else the kit's
  own `film/` (dev mode, for working on the kit itself).
- Run the commands below from `$P`. From anywhere else, add `--project $P` to every kit command or set
  `FILM_PROJECT=$P`.
- Takes resolve from `--takes`, else `WALKTHROUGH_TAKES`, else the storyboard's `takesDir`. Brand resolves from
  `--brand`, else `FILM_BRAND`, else the storyboard's `brand`, else `$P/brand.json` (schema in
  `$KIT/film/brand.example.json`). Frame rate comes from `FILM_FPS` or the storyboard's `fps`.

With the CLI (in `$P`, made by `walkthrough init`; each prints the command below it runs and records the
result in `state.json`):

```bash
walkthrough draft                                  # storyboard.json (storyboard.draft.json when one exists)
walkthrough captions brief && walkthrough captions apply
walkthrough build --dry --audit                    # flags pass through: --aspect 9:16, --fit-audio …, --no-cut
walkthrough build --audit                          # syncs brand/creatives first; --placeholders for a first draft
walkthrough render --name final                    # disk policy, builds when stale, copies the sidecars
walkthrough audit                                  # on the last build's files, standalone
```

`walkthrough render` takes the same build flags (`--aspect`, `--fit-audio`, `--fit-gap`, `--fit-max`, `--brand`,
`--takes`) and rebuilds first when the build on disk is not what they make: files missing, the captions flag
differs, the storyboard changed, or the aspect (read from `index.html`), the fit-audio placement (file and
sha256, gap, max), the brand file or the takes folder differs from the last build's. It prints each input that
changed. Give `render` the flags you built with, or keep `look.aspect` and `fitAudio` in the storyboard so no
flag is needed; `render --no-build` renders what is on disk and warns about each difference.

By hand (the fallback; what the CLI prints):

```bash
node $KIT/film/scripts/init-project.mjs $P
node $KIT/film/scripts/draft-storyboard.mjs $T/<take> [$T/<take> ...] --out $P/storyboard.json
cd $P
node $KIT/film/build.mjs --takes $T --dry --audit
node $KIT/film/scripts/sync-assets.mjs            # after editing brand.json / adding creatives.json
node $KIT/film/build.mjs --takes $T --audit
npx --yes hyperframes@0.9.16 check --json
npx --yes hyperframes@0.9.16 render -o renders/final.mp4 --fps 60
for f in cues.json edl.json; do cp $f renders/final.$f; done; cp captions.srt renders/final.captions.srt
node $KIT/sound/build-sound.mjs --video renders/final.mp4 --deliver out/<film>.mp4
```

## Steps

- [ ] **Project.** `init-project.mjs $P`; put `brand.json` (and `creatives.json`) in `$P`, then
  `node $KIT/film/scripts/sync-assets.mjs` to copy the real logo files and creatives into `$P/assets/`.
- [ ] **Draft (required).** `node $KIT/film/scripts/draft-storyboard.mjs $T/<take> [...] [--take name] --out
  $P/storyboard.json`: one scene per take in the order given; every click becomes a camera framing and a
  caption placeholder, every long wait a time-lapse range. It builds as is (`build.mjs --dry`). Never write a
  storyboard from zero; `$KIT/film/storyboard.example.json` shows the full format.
- [ ] **Aspect** (decide before refining framings): `look.aspect` `"16:9"` (default), `"9:16"` or `"1:1"` in
  `brand.json` or the storyboard's `look` (`--aspect` / `FILM_ASPECT` for one build). The config derives the
  window, caption band, plate (two balanced lines at 9:16 and 1:1), tag row, camera caps, pointer size, wipe
  and stacked title and end cards (`docs/LOOK.md` "Aspect presets"). 9:16 needs phone-preset takes (the build
  stops on a landscape take unless `look.allowLetterbox: true`); every take in the film shares one viewport. A
  phone take gets a neutral device bezel; `look.bezel: false` turns it off. 16:9 over desktop takes is the
  original layout to the byte. A 9:16 cut of a 16:9 film for social: `walkthrough build --aspect 9:16`, then
  `walkthrough render --name final-9x16 --no-build` (the `social` preset picks up `renders/<render>-9x16.mp4`),
  then rebuild at the film's own aspect.
- [ ] **Write the copy (required).** The draft leaves `TODO: <label>` caption placeholders; the tool prepares
  and checks, an agent writes the words (`docs/CAPTIONS.md`). Add a one-line `"intent"` per scene from the
  plan, drop the placeholders you will not use, then `walkthrough captions brief` (or
  `node $KIT/film/scripts/draft-captions.mjs brief $P/storyboard.json --takes $T`): `captions.brief.md` gives per caption the intent, the click, the `mark` text near it, the next
  events, its window in film seconds, the most words that fit and a claim candidate, plus a blank
  `captions.answers.json`. A Sonnet agent (or you, for a short film) fills it: at most 10 words and at most
  the window's limit, following the caption rules in `docs/LOOK.md` (one line, hold ≥ 0.5 s + 0.3 s per word,
  true to the frame: a caption whose claim is not visibly true is cut); UI text in quotes, copied from a
  mark's logged text. `walkthrough captions apply` (or `draft-captions.mjs apply captions.answers.json
  $P/storyboard.json --takes $T`) writes
  the texts (keeps a `.bak`), tags quoted UI text with `"claims": "mark:<label>"` (an error when no mark
  holds it), refuses over-long answers, raises short holds and prints the caption lint. The audit fails on
  a claim mismatch. Default: a tour with a voiceover still gets captions (they feed the `.srt` and the
  captioned twin) unless the owner says captions off. For a voiceover-only film, set `"captions": false`
  in the storyboard and write the narration per scene against the dry-run windows instead (`brief --voice`
  gives each scene's window and word budget; skill `voiceover`, `make_script.py`).
- [ ] **Refine** the draft against INDEX.md and the plan: kept ranges as event references (`"click:send"`,
  `"mark:options#2"`), time-lapses over waits (loader shown at normal speed first, labelled), slow-downs only
  where the moment is the point (untagged), excises over listed capture stalls, camera framings by marked
  element, spotlights (at most about six), captions anchored to events, scene exits (push, whip, wipe, hard
  cut). Size holds for the chosen twin: reading time for captions, speech time for a voiceover, the slower of
  the two when both twins are wanted. `python3 $KIT/film/scripts/list-events.py $T/<take>` lists a take's
  anchorable events.
- [ ] **Pointer at cuts.** The build treats every cut where the drawn pointer would jump more than
  `jump.bridge` (120 stage px): a 0.35 s arc **bridge** on the recorder's curve up to `jump.fade` (400 px),
  a **fade** beyond (out 0.15 s before the cut, in 0.2 s after, always back by the next click). It prints
  `pointer: bridge|fade <px> px at <t> s (<cut>)` per cut and lists them in `edl.json` `pointerTreatments`.
  Storyboard `"pointerAtCuts": "auto"` (default) | `"bridge"` | `"fade"` | `"none"`, `"jump": { "bridge",
  "fade" }`, and per cut `"pointer"` on an exit or a range to overrule one. Vary it where the story asks: end
  on a punch-in, or a push/whip at a story break. Under `"none"` the audit errors on every untreated jump.
- [ ] **Dry run.** `walkthrough build --dry --audit` (`node $KIT/film/build.mjs --takes $T --dry --audit`): read
  the durations table, the pointer lines and the audit; adjust until the total is in range (3:00-3:15 worked)
  and there are no errors.
- [ ] **Script-first timing (voice-led films only).** Picture-first is the default: the voice is written to
  the picture's windows. When the narration leads (tutorials, or a script the owner wrote first), the voice
  producer places it first (`tts.mjs` back to back, each line with a `scene` and an `anchor`), then build
  with `--fit-audio voiceover/placement.json [--fit-gap 0.3] [--fit-max 6]` (or `"fitAudio"` in the
  storyboard). Each line longer than its window gets a frame-exact hold on the longest rest moment in it
  (no move, click, typing, scroll or mark; outside agent waits); the table gets a `fit` column, `edl.json`
  `fitAudio`, the audit a `fit` row (holds over 2 s warn: they may read as freezes). It refuses, naming the
  line, window and shortfall, for a line on the title or end card, one needing more than `--fit-max`, or one
  with no 0.4 s rest: re-cut the scene, move or shorten the line. After a fit, the voice is re-placed on the
  new cut (`fitcheck.py`, then `assemble --windows`). Do not use it to rescue a picture-first film whose
  lines overrun: shorten the lines.
- [ ] **Build and render a draft** in the foreground: `walkthrough build --audit` then `walkthrough render
  --name <name>` (it copies `cues.json`, `edl.json`, `captions.srt` beside the render as
  `renders/<name>.cues.json`, `.edl.json`, `.captions.srt`). The frame cache is removed after a successful
  render: `walkthrough render` keeps it in `.hyperframes/frames-cache` and deletes it when the render is
  done (`--keep-cache` keeps it while you render the same footage again; then `walkthrough clean`). By hand:
  `node $KIT/film/build.mjs --takes $T --audit`, `npx --yes hyperframes@0.9.16 check --json`,
  `HYPERFRAMES_EXTRACT_CACHE_DIR=.hyperframes/frames-cache npx --yes hyperframes@0.9.16 render -o
  renders/<name>.mp4 --fps 60`, copy the three sidecars yourself and `/bin/rm -rf .hyperframes/frames-cache`.
- [ ] **Look.** `walkthrough review --render <name>` makes the contact sheets and cut strips (skill
  `review-film`); or `python3 $KIT/film/scripts/scene-sheets.py renders/<name>.mp4 edl.json <outdir> 1 480`
  per scene. Check the pointer treatments read well, the heartbeat pixel in zoomed top-left framings,
  captions over tags.
- [ ] Review loop (skill `review-film`) until the must-fix list is empty.
- [ ] **Audit (required before every review and before lock).** `walkthrough build --audit` after a build
  (`--dry --audit` checks the would-be files without the holds check), or standalone `walkthrough audit` /
  `node $KIT/film/scripts/audit.mjs [storyboard.json] [--takes d] [--edl f --cues f --srt f] [--hold 1.0]
  [--jump 120] [--tail 1.0] [--no-holds] [--json]`. It checks frozen holds, pointer jumps at cuts (treated
  ones read `ok (auto bridge|fade)`), dead air after a caption, caption lint, caption claims and fit holds. Exit 1 means errors (caption overlap, a claim mismatch,
  an edl from another build): fix them. Warnings: fix or justify each one in the report.
  `python3 $KIT/film/scripts/holds.py 1.0` gives the detailed hold list.
- [ ] **Picture lock:** `walkthrough state lock` (later builds warn when the storyboard changes);
  `renders/final.mp4` with its sidecars; hand to the sound designer, whose `--deliver`
  renames it `final.picture-only.mp4` so the silent picture can never pass for the film.
- [ ] **Twins from one lock:** render each chosen version from the same locked storyboard: the captioned film
  normally, the voiceover twin with `walkthrough render --name final-vo --no-captions` (it builds the
  `--no-captions` twin first; by hand `node $KIT/film/build.mjs --takes $T --no-captions`, rendered to
  `renders/final-vo.mp4` with its own `final-vo.*` sidecars), identical timing to the frame. Never re-cut one
  twin alone.
- [ ] **Re-timing after the voiceover is placed:** `node $KIT/film/build.mjs --takes $T --dry --dry-out <dir>`,
  send the dry-run `edl.json`/`cues.json` and an old-versus-new table to the voiceover producer, render only
  after it says "all lines fit".

## Verification

`hyperframes check` zero errors; `--audit` clean or every finding justified; durations in range; every click frame shows the clicked
control in frame; captions true to their frames; the critic's must-fix list empty.

## Outputs

`$P/renders/<name>.mp4` (renamed `<name>.picture-only.mp4` at delivery) with `<name>.edl.json`,
`<name>.cues.json`, `<name>.captions.srt`; the build files in `$P`;
per-scene sheets; the editor's durations table and flaw list.

## Pitfalls

- Renders started in the background and never reported (E8): foreground only.
- Rendering while takes record (C3): code and `--dry` only until "recording finished".
- Camera on the wrong box (E1), long frozen holds (E2), pointer jumps (E3; now bridged or faded by the
  build, still look at them), a key line too brief (E4).
- A `--fit-audio` hold over 2 s reads as a freeze: re-cut or shorten the line rather than accept it.
- `--emit-only` writes everything but the footage (no ffmpeg, masters need not exist); it is for the golden
  test (`npm test` in the kit), not for a film. Changes to `film/lib` move the goldens on purpose only.
- A caption whose claim is not visible (E5): cut it or fix the app.
- Re-timing after VO placement without a fit check (E9) costs a second render.
- Frame caches and drafts left behind fill the owner's disk: `--keep-cache` only between renders of the same
  footage; after picture lock `walkthrough clean --yes` drops replaced `draft*` renders and the sheets of older
  review bundles. Temp folders never outlive the step.
