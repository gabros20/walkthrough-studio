---
name: build-film
description: Cut a walkthrough or tour film from recorded takes (studio or site mode) with the HyperFrames film kit - a first-pass storyboard drafted from events.json, refined by hand (event-anchored ranges, time-lapses, slow-downs, excises, camera framings by element box, spotlights, captions anchored to events, transitions), build.mjs, dry runs, draft renders, the build audit (holds, pointer jumps at cuts, caption lint and truth), picture lock, and the captioned and --no-captions twins from one lock. Use after takes exist, after review rulings, and when timing must change.
---

# Build the film

The film editor (`agents/film-editor.md`, Opus) does this work (or, without sub-agents, you do that role's
checklist yourself: see `agents/film-editor.md` in the kit). You give it the takes, the plan and the
rulings, and you rule on what it reports.

Read: `docs/STORYBOARD.md` (format), `docs/LOOK.md` (numbers, banned list), `$KIT/film/README.md`, the `hyperframes`
skill. Example: `examples/brightpost/storyboard.json`, `brand.json`, `creatives.json`, `captions.srt`.

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
- [ ] **Write the copy (required).** The draft leaves `TODO: <label>` caption placeholders. A Sonnet agent
  (or you, for a short film) turns each into a caption of at most 10 words from the scene's intent in the
  plan, the `mark` text and the event label. It follows the caption rules in `docs/LOOK.md`: one line, hold
  ≥ 0.5 s + 0.3 s per word, true to the frame. Any quoted UI text is tagged with `"claims": "mark:<label>"`.
  The audit fails on a claim mismatch. Default: a tour with a voiceover still gets captions (they feed the
  `.srt` and the captioned twin) unless the owner says captions off. For a voiceover-only film, set
  `"captions": false` in the storyboard and write the narration per scene against the dry-run windows
  instead (skill `voiceover`, `make_script.py`).
- [ ] **Refine** the draft against INDEX.md and the plan: kept ranges as event references (`"click:send"`,
  `"mark:options#2"`), time-lapses over waits (loader shown at normal speed first, labelled), slow-downs only
  where the moment is the point (untagged), excises over listed capture stalls, camera framings by marked
  element, spotlights (at most about six), captions anchored to events, scene exits (push, whip, wipe, hard
  cut). Size holds for the chosen twin: reading time for captions, speech time for a voiceover, the slower of
  the two when both twins are wanted. `python3 $KIT/film/scripts/list-events.py $T/<take>` lists a take's
  anchorable events.
- [ ] **Dry run.** `node $KIT/film/build.mjs --takes $T --dry --audit`: read the durations table and the
  audit; adjust until the total is in range (3:00-3:15 worked) and there are no errors.
- [ ] **Build and render a draft** in the foreground: `node $KIT/film/build.mjs --takes $T --audit`,
  `npx --yes hyperframes@0.9.16 check --json`, `npx --yes hyperframes@0.9.16 render -o renders/<name>.mp4 --fps 60`,
  then copy `cues.json`, `edl.json`, `captions.srt` beside it as `renders/<name>.cues.json`,
  `renders/<name>.edl.json`, `renders/<name>.captions.srt`.
- [ ] **Look.** `python3 $KIT/film/scripts/scene-sheets.py renders/<name>.mp4 edl.json <outdir> 1 480` per
  scene; strips around cuts. Fix pointer jumps at hard cuts (fade/slide off and back in, end on a punch-in, or
  a push/whip at a story break; vary the treatment), the heartbeat pixel in zoomed top-left framings, captions
  over tags.
- [ ] Review loop (skill `review-film`) until the must-fix list is empty.
- [ ] **Audit (required before every review and before lock).** `build.mjs --audit` after a build
  (`--dry --audit` checks the would-be files without the holds check), or standalone
  `node $KIT/film/scripts/audit.mjs [storyboard.json] [--takes d] [--edl f --cues f --srt f] [--hold 1.0]
  [--jump 120] [--tail 1.0] [--no-holds] [--json]`. It checks frozen holds, pointer jumps at cuts, dead air
  after a caption, caption lint and caption claims. Exit 1 means errors (caption overlap, a claim mismatch,
  an edl from another build): fix them. Warnings: fix or justify each one in the report.
  `python3 $KIT/film/scripts/holds.py 1.0` gives the detailed hold list.
- [ ] **Picture lock:** `renders/final.mp4` with its sidecars; hand to the sound designer, whose `--deliver`
  renames it `final.picture-only.mp4` so the silent picture can never pass for the film.
- [ ] **Twins from one lock:** render each chosen version from the same locked storyboard: the captioned film
  normally, the voiceover twin with `node $KIT/film/build.mjs --takes $T --no-captions` rendered to
  `renders/final-vo.mp4` with its own `final-vo.*` sidecars, identical timing to the frame. Never re-cut one
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
- Camera on the wrong box (E1), long frozen holds (E2), pointer jumps (E3), a key line too brief (E4).
- A caption whose claim is not visible (E5): cut it or fix the app.
- Re-timing after VO placement without a fit check (E9) costs a second render.
