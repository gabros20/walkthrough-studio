---
name: deliver-package
description: Build the deliverables for a finished walkthrough film with one preset command (walkthrough deliver --preset sales|web|social|docs) - the sales package of renamed masters and web encodes, posters, subtitles (.srt/.vtt), per-feature clips cut on scene boundaries, cropped stills, a curated creative showcase with designed sheets, written copy (key messages, verified facts, captions and voiceover script, presenter notes, slide copy), README as md/html/pdf, verification and a zip; web embeds with poster, VTT and YouTube chapters; social clips under 60 s with burned captions (vertical from a 9:16 render); docs clips and GIFs per feature. Use when the films are final and need to go to a project manager, client or stakeholder, or to refresh a package after a re-cut.
---

# Deliver the package

Read `docs/DELIVERY.md` first (structure, naming, encodes, the README notes, the review checklist). The real
package's README, copy and config are in `examples/brightpost/delivery/`.

**Where the kit is.** `KIT` is the walkthrough-studio checkout; kit paths (`recorder/`, `film/`, `docs/`,
`agents/`, ...) are relative to it. Use the first of these that holds `recorder/` and `film/`:
`${CLAUDE_PLUGIN_ROOT}` (Claude Code or Codex plugin install; skip it if it shows unexpanded),
`$WALKTHROUGH_STUDIO_HOME`, `~/walkthrough-studio`, this skill's own `../..`. If none does, the install copied
only this file (skills.sh): ask the user to run
`git clone https://github.com/gabros20/walkthrough-studio ~/walkthrough-studio && cd ~/walkthrough-studio && npm run setup`.
Without sub-agents (most platforms other than Claude Code), do each named agent's role yourself from
`$KIT/agents/<name>.md`.

## Presets (one command per output)

```bash
walkthrough deliver --preset sales  --video out/<film>.mp4 [--vo-video out/<film>-voiceover.mp4]
walkthrough deliver --preset web    --video out/<film>.mp4
walkthrough deliver --preset social --video out/<film>.mp4      # vertical: renders/final-9x16.mp4 first
walkthrough deliver --preset docs   --video out/<film>.mp4
```

`walkthrough deliver` runs `python3 -I $KIT/delivery/run_preset.py <preset> --project <p>` (numbers in
`delivery/presets.json`), prints every command (`›`), writes `MANIFEST.txt` (path, bytes, duration, sha256),
runs `delivery/verify.py`, applies the disk policy and records the run in `state.deliveries`.

| Preset | Makes | Needs |
|---|---|---|
| `sales` | the full package below (films, clips, stills, showcase, copy, README md/html/pdf), zipped | the mixed film; `package.config.json` (generated from the renders when missing: edit its stills); Pillow; Playwright for the PDF; a `showcase.creatives` folder for `04_Creative-Showcase` |
| `web` | 1080p30 and 720p encodes, a poster, `.srt` + `.vtt`, `description.txt` with YouTube chapters at feature starts | the mixed film; 3+ features of 10 s+ for chapters |
| `social` | one clip per feature, at most 60 s, captions burned in unless the picture carries them | the mixed film; for vertical clips a 9:16 render as `renders/<render>-9x16.mp4` with its sidecars (skill `build-film`, Aspect) |
| `docs` | per feature a 10-30 s clip, its `.srt`, a GIF of at most 8 MB, a poster `.jpg`, `index.md` | the mixed film; features of 10-30 s (regroup scenes, it never trims) |

- **The mixed film**: a render has no sound until the sound build. Pass the sound build's output with
  `--video out/<film>.mp4` (and `--vo-video` for the voiceover twin); without it `renders/<name>-sound.mp4`
  is used when the render is silent. A silent film stops every preset (`--allow-silent` only for test
  renders; `sales` refuses silent masters regardless).
- **Features** are the storyboard's scene groups (consecutive scenes sharing a `"group"`, named by
  `groups.<g>.name`); title and end cards are not features. Group the scenes to get the cuts you want.
- No clip boundary cuts a spoken line: the boundary moves to a gap within 1 s, else a voiceover run stops.
- A preset replaces its output folder only when it holds a `MANIFEST.txt`; any other non-empty folder is
  refused. `--zip` zips (`sales` always does); `--out` picks the folder.

The rest of this skill is the `sales` package in depth: the config, the two packager modes and the review.
`sales` runs every step itself, but its written material comes from `<project>/delivery/` (`README.md`,
`05_Copy/*.md`) when written there, else from `delivery/templates/` with `TODO` lines. So the copy-mode agent
writes those files in `<project>/delivery/` (and curates the showcase) before the final `sales` run; never
ship a package whose README or copy still says `TODO`. The by-hand steps below are the same tools one by one.

## Inputs

- Final films (one per variant, e.g. Captions and Voiceover), each with audio, its `.srt` and its `edl.json`.
- The plan's story, `takes/INDEX.md`, the app repo (to verify facts), the app's generated creatives.
- Brand tokens: accent, ink, paper, logo file, fonts.
- An output folder outside the repo (or a git-ignored one).

## Steps

- [ ] Confirm every film has sound: `ffprobe` shows an audio stream of full length (`delivery/verify.py`
  refuses silent videos). Never package a `*.picture-only.mp4`.
- [ ] Write `package.config.json` (or start from the one `walkthrough deliver --preset sales` generates, or
  `examples/brightpost/delivery/package.config.json`): product
  prefix, out, brand, films (`variant`, `master`, `srt`, `edl`, `poster_t`, `speech: true` for the voiceover
  film), clips (name → scene ids), stills (`from` the captionless variant, times, crop modes).
- [ ] Spawn two agents in one message (they own different folders):
  - `delivery-packager` with `model: sonnet`, media mode: 01_Films, 02_Feature-Clips, 03_Screenshots.
  - `delivery-packager` (opus), copy mode: 04_Creative-Showcase, 05_Copy, README md/html/pdf.
    `04_Creative-Showcase` exists only when the app makes creatives; a site tour skips it (and leaves the
    `stills` of its own pages in 03_Screenshots).
  Give each the config path, the scratchpad folder, the folders it owns and the other agent's folders to
  leave alone. (Or, without sub-agents, do both modes yourself, media first: see
  `agents/delivery-packager.md` in the kit.)
- [ ] Media mode runs:
  ```bash
  python3 -I delivery/films.py  package.config.json
  python3 -I delivery/clips.py  package.config.json --dry   # read the plan, then run without --dry
  python3 -I delivery/stills.py package.config.json
  python3 -I delivery/inventory.py <out> > <scratchpad>/files.md
  ```
- [ ] Copy mode builds the showcase (`delivery/showcase_sheet.py` for Pillow sheets, or HTML rendered with
  Playwright for richer type), the six copy files, the README, then:
  ```bash
  python3 -I delivery/md2html.py <out>/README.md <out>/README.html --config package.config.json
  node delivery/html2pdf.mjs <out>/README.html <out>/README.pdf
  ```
- [ ] You review: the hero sheet at full and slide size, 4-6 stills, the first and last frame of two clips,
  the README. Send fixes back.
- [ ] `python3 -I delivery/verify.py package.config.json --loudness` passes.
- [ ] `delivery/zip.sh <out>`; report the zip path, size and file count.
- [ ] **Clean up (the final step).** `walkthrough deliver` ends with what is reclaimable now and once the
  client accepts, and the exact `walkthrough clean --all --yes` line. Run `walkthrough clean --dry`, put the
  table (logical vs on-disk size, what goes, what stays) in the handover, and once the owner says the film is
  accepted run `walkthrough clean --all --yes`: every checkpoint, raw frames, frame caches and buffer folders
  go; the packages in `out/`, the masters and the latest renders stay. A packager's scratch folders go when
  its step ends. Never leave checkpoints, raw frames or caches behind.

## Verification

`verify.py` output (all videos with audio, masters byte-identical, VTT valid, loudness at start/middle/end;
`verify.py --dir <folder>` for any preset folder, including GIF sizes and the manifest's sha256s), the review
checklist in `docs/DELIVERY.md` ticked, and your own look at the items above.

## Outputs

`<Product>_Demo-Package/` and `<Product>_Demo-Package_<date>.zip` (sales), `out/<Product>_Web`,
`out/<Product>_Social`, `out/<Product>_Docs` (the other presets), each with `MANIFEST.txt`, plus a handover
message: what is in each
folder with sizes, known flaws in the films with times, listening checks for a human, the open licence check
for generated media, that nothing was uploaded, and the `walkthrough clean --dry` table with the line to run
after acceptance.

## Pitfalls (from `docs/LESSONS.md`)

- A silent "final" once reached the owner (S1): verify audio on every file.
- Voiceover clips must not cut a spoken line (E10): `clips.py` moves boundaries or stops.
- Stills from the captioned film carry a dead caption band (E11): take them from the captionless variant.
- ffmpeg may lack `drawtext` (E12); the scripts use Pillow.
- zsh aliases break `rm -f` and `zip` (A5); `zip.sh` uses absolute paths.
- Curate the showcase hard: no logo over lettering, no unreadable logos, no third-party shop logos of
  unknown status, no empty bands or text-only fallbacks.
- ElevenLabs free-tier licence is an open check for the owner (S7), stated plainly in the README.
