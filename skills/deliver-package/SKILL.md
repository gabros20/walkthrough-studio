---
name: deliver-package
description: Build the delivery package for a finished walkthrough film - renamed masters and web encodes, posters, subtitles (.srt/.vtt), per-feature clips cut on scene boundaries, cropped stills, a curated creative showcase with designed sheets, written copy (key messages, verified facts, captions and voiceover script, presenter notes, slide copy), README as md/html/pdf, verification and a zip. Use when the films are final and need to go to a project manager, client or stakeholder, or to refresh a package after a re-cut.
---

# Deliver the package

Read `docs/DELIVERY.md` first (structure, naming, encodes, the README notes, the review checklist). The real
package's README, copy and config are in `examples/kleber-content-ai/delivery/`.

## Inputs

- Final films (one per variant, e.g. Captions and Voiceover), each with audio, its `.srt` and its `edl.json`.
- The plan's story, `takes/INDEX.md`, the app repo (to verify facts), the app's generated creatives.
- Brand tokens: accent, ink, paper, logo file, fonts.
- An output folder outside the repo (or a git-ignored one).

## Steps

- [ ] Confirm every film has sound: `ffprobe` shows an audio stream of full length (`delivery/verify.py`
  refuses silent videos). Never package a `*.picture-only.mp4`.
- [ ] Write `package.config.json` from `examples/kleber-content-ai/delivery/package.config.json`: product
  prefix, out, brand, films (`variant`, `master`, `srt`, `edl`, `poster_t`, `speech: true` for the voiceover
  film), clips (name → scene ids), stills (`from` the captionless variant, times, crop modes).
- [ ] Spawn two agents in one message (they own different folders):
  - `delivery-packager` with `model: sonnet`, media mode: 01_Films, 02_Feature-Clips, 03_Screenshots.
  - `delivery-packager` (opus), copy mode: 04_Creative-Showcase, 05_Copy, README md/html/pdf.
    `04_Creative-Showcase` exists only when the app makes creatives; a site tour skips it (and leaves the
    `stills` of its own pages in 03_Screenshots).
  Give each the config path, the scratchpad folder, the folders it owns and the other agent's folders to
  leave alone.
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

## Verification

`verify.py` output (all videos with audio, masters byte-identical, VTT valid, loudness at start/middle/end),
the review checklist in `docs/DELIVERY.md` ticked, and your own look at the items above.

## Outputs

`<Product>_Demo-Package/` and `<Product>_Demo-Package_<date>.zip`, plus a handover message: what is in each
folder with sizes, known flaws in the films with times, listening checks for a human, the open licence check
for generated media, and that nothing was uploaded.

## Pitfalls (from `docs/LESSONS.md`)

- A silent "final" once reached the owner (S1): verify audio on every file.
- Voiceover clips must not cut a spoken line (E10): `clips.py` moves boundaries or stops.
- Stills from the captioned film carry a dead caption band (E11): take them from the captionless variant.
- ffmpeg may lack `drawtext` (E12); the scripts use Pillow.
- zsh aliases break `rm -f` and `zip` (A5); `zip.sh` uses absolute paths.
- Curate the showcase hard: no logo over lettering, no unreadable logos, no third-party dealer logos of
  unknown status, no empty bands or text-only fallbacks.
- ElevenLabs free-tier licence is an open check for the owner (S7), stated plainly in the README.
