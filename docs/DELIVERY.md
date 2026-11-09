# Delivery package

*Mode: reference (structure, encodes, written material) with a how-to (Commands) and a checklist. Script flags: [`delivery/README.md`](../delivery/README.md); the workflow: skill `deliver-package`.*

The package is what the owner sends to the person who talks to the client. That person may forward the film
as it is, or reuse pieces in a deck, a web page or a live presentation, without us in the room. Everything is
named so it can be dropped into a slide, and explained in a README that opens on double-click.

Worked example: `examples/brightpost/delivery/` (the real README, copy files, showcase README, a file
manifest, and the `package.config.json` that reproduces its films, clips and stills).

## Presets

One command builds a whole output from a project's renders: `walkthrough deliver --preset <name>` (or
`python3 -I delivery/run_preset.py <name> --project <dir>`). The numbers live in `delivery/presets.json`; every
command run is printed (`›`), every preset writes `MANIFEST.txt` and runs `delivery/verify.py`, and `--zip` zips
the result with `delivery/zip.sh` (`sales` always does). Through the CLI the run first passes the disk policy
(free space of 2-6 times the films' size, `--min-free <GB>` to set it): when the project volume is short and a
buffer has room, the output is written on the buffer and the zip is copied back to `<project>/out/`. Each run is
recorded in `state.json` `deliveries` (preset, render, out, zip, files, bytes, spilled, exit), with a per-folder
summary printed at the end.

| Preset | Makes | Default folder | Needs |
|---|---|---|---|
| `sales` | the full package below: films, clips, stills, showcase, copy, README md/html/pdf, verify, zip | the config's `out` (`out/<Product>_Demo-Package`) | a render with sound and its sidecars; `package.config.json` (generated when missing); Pillow; Playwright for the PDF; a `showcase.creatives` folder for `04_Creative-Showcase` |
| `web` | 1080p30 and 720p web encodes, a poster, `.srt` + `.vtt`, `description.txt` with YouTube chapters, per film | `out/<Product>_Web` | a render with sound and its sidecars; the storyboard's groups for chapter names |
| `social` | one clip per feature, at most 60 s, captions burned in | `out/<Product>_Social` | as `web`; a 9:16 render for vertical clips |
| `docs` | per feature: a 10-30 s clip, its `.srt`, a GIF of at most 8 MB, a poster `.jpg`; `index.md` | `out/<Product>_Docs` | as `web` |

**Inputs.** A render is `renders/<name>.mp4` (`--render`, default `final`) with the sidecars copied beside it after
the render: `renders/<name>.edl.json`, `.captions.srt`, `.cues.json` (`film/README.md`). The rendered picture has no
sound until the sound build: pass its output with `--video out/<film>.mp4`; without `--video`,
`renders/<name>-sound.mp4` is used when the render itself is silent. A silent film stops every preset
(`--allow-silent` is for test renders; `sales` refuses silent masters regardless). `sales` and `web` also take the
voiceover twin (`--vo-render`, default `final-vo` when `renders/final-vo.mp4` exists; `none` skips it).

**Features.** The presets cut on the storyboard's scene groups: consecutive scenes that share a `"group"` are one
feature, named by `groups.<g>.name` (`docs/STORYBOARD.md`). An ungrouped scene is its own feature, named by its
first caption, else its id. Title and end cards are not features. Group the scenes in the storyboard to get the
features you want; the presets never invent cuts inside a scene, except that `social` splits a feature over 60 s at
a scene boundary or a gap between captions. No clip boundary cuts a spoken line (`clips.py`'s rule: the boundary
moves to the nearest gap within 1 s, else the run stops for a voiceover film; for a captions film a caption that
cannot be kept whole is reported).

**web.** `<Product>_Walkthrough_<Variant>_1080p30_web.mp4` and `_720p30_web.mp4` (encodes table below),
`_poster.jpg` (at 6 s, on the title card), `.srt` and `.vtt`. `description.txt` (and `description-voiceover.txt`)
holds an intro placeholder to replace and the chapters: `0:00 Intro`, then each feature at its start in the EDL,
whole seconds rounded down. YouTube shows chapters only with three or more, each at least 10 s; the run warns when
the film breaks either rule.

**social.** `<nn>-<feature>.mp4` with `<nn>-<feature>.srt` (that span, from 0) and `index.md`. Captions are burned
only when the picture does not already carry them: a captions film (its `cues.json` says `"captions": true`) is cut
as is; the voiceover twin (`--render final-vo`) gets its spoken lines burned in (`--burn` / `--no-burn` override).
The burn uses the first route this machine has: the ffmpeg `subtitles` filter (needs libass), else `drawtext`
(needs libfreetype and a font), else caption plates drawn with Pillow and overlaid (works with any ffmpeg); with
none, the clips keep the sidecar `.srt` and the run says the captions were not burned. Clips keep the render's shape.
For vertical clips render a 9:16 film as `renders/<render>-9x16.mp4` with its sidecars; `social` uses it
automatically. A 9:16 film needs phone-preset takes (`docs/LOOK.md`, "Aspect presets"): `walkthrough build --aspect
9:16`, then `walkthrough render --name <render>-9x16 --no-build`. Without one, social clips keep the film's 16:9.

**docs.** For help centres and READMEs: `<nn>-<feature>.mp4` (1080p30, with sound if the film has it), `.gif`
(silent, loops; palette per clip; 960 px at 15 fps, then smaller steps from `presets.json` until it is at most
8 MB), `.srt` and `.jpg` (mid-clip). `index.md` lists each feature with its duration and files, plus a Markdown and
an HTML embed line. A feature outside 10-30 s is reported, not trimmed: regroup the scenes.

**MANIFEST.txt.** One tab-separated row per file: path, bytes, duration in seconds (media), sha256. Checked by
`python3 -I delivery/verify.py --dir <folder>`, or by hand:
`awk -F'\t' '!/^#/{print $4"  "$1}' MANIFEST.txt | shasum -a 256 -c`.

**Re-running.** A preset replaces its output folder only when that folder holds a `MANIFEST.txt` or an unfinished
run's marker; any other non-empty folder is refused. `sales` saves the config it ran with, absolute paths, beside
the package as `<package>.config.json`; a generated `package.config.json` (clips per feature, stills mid-feature) is
saved in the project to edit: look at every still and set its time.

## Structure

```
<Product>_Demo-Package/
  README.md  README.html  README.pdf
  01_Films/
    <Product>_Walkthrough_Captions_1080p60.mp4        exact copy of the master (checksum-verified)
    <Product>_Walkthrough_Captions_1080p60.srt / .vtt
    <Product>_Walkthrough_Captions_1080p60_poster_1920x1080.jpg
    <Product>_Walkthrough_Voiceover_1080p60.mp4 (+ .srt/.vtt of the spoken lines, poster)
    web/  <Product>_Walkthrough_<Variant>_1080p30_web.mp4, _720p30_web.mp4
  02_Feature-Clips/
    captions/   <Product>_<nn>_<Feature-name>_Captions.mp4     (00_Title ... nn_End-card)
    voiceover/  <Product>_<nn>_<Feature-name>_Voiceover.mp4
  03_Screenshots/
    <Product>_<nn><a>_<Scene>_<What-it-shows>.png         cropped to the app window, no caption band
    full-frame-16x9/                                      the same frames at 1920x1080
  04_Creative-Showcase/
    README.md  <Product>_Creative-Showcase.pdf  index.csv
    sheets/     01_Hero_A3, 01_Hero_16x9, 02_..., as PNG + JPG
    creatives/<campaign>/<campaign>_<option>_<platform>-<format>_<language>.<ext>
  05_Copy/
    Key-messages.md  Facts-and-figures.md  Film-captions.md  Voiceover-script.md
    Presenter-notes.md  Slide-copy.md
```

Naming: `Product-Name_` prefix with hyphens inside words and underscores between parts; numbers in story
order; what a file shows is in its name. No spaces.

## Encodes

| File | Video | Audio | Notes |
|---|---|---|---|
| Master | as rendered (1920x1080, 60 fps, H.264) | AAC | byte copy, never re-encoded |
| Web 1080p | 1920x1080, 30 fps, H.264 high, yuv420p, CRF 23 | AAC 160k 48 kHz | `+faststart`; about 17-27 MB for 3 min |
| Web 720p | 1280x720, otherwise as above | AAC 160k | for email and slow pages |
| Feature clip | 1920x1080, 30 fps, CRF 20, re-encoded frame-accurately | AAC 160k, 0.3 s fade in/out | cut on scene boundaries from `edl.json` |
| Poster | 1920x1080 JPG, a strong frame (title card with lockup and both lines) | | video thumbnail |
| Still | PNG, cropped to the window area | | from the captionless variant |
| Social clip | the render's shape, short side 1080, 30 fps, CRF 20 | AAC 160k, 0.3 s fade in/out | at most 60 s; captions burned unless already in the picture |
| Docs clip | 1080p, 30 fps, CRF 20 | as the film | 10-30 s per feature |
| Docs GIF | 960 px at 15 fps, palette per clip (`palettegen`/`paletteuse`, bayer dither) | | at most 8 MB; steps down to 480 px at 8 fps |

## Commands

The `sales` preset runs these in order; each also runs alone. All driven by one `package.config.json` (see the example):

```bash
python3 -I delivery/films.py   package.config.json          # 01_Films (+ web encodes; --skip-web to skip)
python3 -I delivery/clips.py   package.config.json --dry    # plan; then without --dry to encode
python3 -I delivery/stills.py  package.config.json          # 03_Screenshots
python3 -I delivery/contact_sheet.py FILM.mp4 out/ --at 12.0,37.8,85.5 --cols 3 --width 640  # look at stills
python3 -I delivery/showcase_sheet.py sheet.json sheet.png --jpg   # a showcase sheet (Pillow)
python3 -I delivery/md2html.py README.md README.html --config package.config.json
node delivery/html2pdf.mjs README.html README.pdf
python3 -I delivery/inventory.py <package dir> > files.md
python3 -I delivery/verify.py  package.config.json --loudness
python3 -I delivery/verify.py  --dir <any preset folder>     # files, VTT, GIF sizes, MANIFEST.txt sha256s
delivery/zip.sh <package dir>
```

## The written material

| File | Content | Rule |
|---|---|---|
| `README` | What the product is in three sentences; one table row per folder (what it is, use it for); how to use it in a deck, on a web page, presenting live; the notes below | one or two pages, plain words |
| `Key-messages.md` | the product in one line, one paragraph, 5-7 proof points each tied to a film time; words to use and avoid | every number checked |
| `Facts-and-figures.md` | only facts verified in the code or the recording, each with its source file and line | if the app changes, the code wins |
| `Film-captions.md` / `Voiceover-script.md` | exact text with times, from the `.srt` files | word for word |
| `Presenter-notes.md` | scene-by-scene talk track for about 3 minutes, plus answers to likely questions | which file to play, music down |
| `Slide-copy.md` | about eight slides: headline, two-line body, the clip/still/sheet that goes with it | names real files |
| Showcase `README.md` | what each sheet shows, where the images came from, how they were chosen and what was left out | design calls stated as such |

Use the British or American spelling the film uses, consistently. No hype words.

## Notes that must be in the README

State these plainly and without alarm:

- Which people, companies and logos are fictional demo material.
- The film shows real app footage; agent waits are shortened and labelled as time-lapses; where the app shows
  the true duration, say so.
- Generated media (music, voice, any generated images): the service, the account it was made on, and an
  **open check for the owner** to confirm the licence terms of that plan before public or commercial use.
  Not a legal statement; we have not verified them.
- What has not been reviewed, for example "nobody on the production side has listened to the audio".

## Before sending: review checklist

- [ ] `delivery/verify.py --loudness` passes: every video has audio of full length; masters byte-identical;
      VTT valid; loudness in range at start, middle and end (measured, not heard).
- [ ] First and last frame of every clip looked at: no click, no half transition, no spoken line cut.
- [ ] Every kept still looked at: no motion blur, no loader, pointer not on the subject, no logo over
      artwork lettering, no unreadable logo on its background.
- [ ] Showcase sheets looked at full size and at slide size.
- [ ] Every number in the copy traced to a source.
- [ ] Known flaws in the films listed for the owner with times (for example "2:37-2:40 shop logo over
      lettering in the artwork, about 3 s").
- [ ] Listening checks handed to a human: the music start, any splice in the bed, the voice on the product
      name and on any line the transcription flagged, the level at the end card.
- [ ] `.DS_Store` removed; zipped with `/usr/bin/zip -r -X` (`delivery/zip.sh`).
- [ ] The package and its zip stay out of git (`.gitignore`), and are not uploaded anywhere without the
      owner's go-ahead.
