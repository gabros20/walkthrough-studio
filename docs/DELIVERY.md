# Delivery package

The package is what the owner sends to the person who talks to the client. That person may forward the film
as it is, or reuse pieces in a deck, a web page or a live presentation, without us in the room. Everything is
named so it can be dropped into a slide, and explained in a README that opens on double-click.

Worked example: `examples/kleber-content-ai/delivery/` (the real README, copy files, showcase README, a file
manifest, and the `package.config.json` that reproduces its films, clips and stills).

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

## Commands

All driven by one `package.config.json` (see the example):

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
- [ ] Known flaws in the films listed for the owner with times (for example "2:37-2:40 dealer logo over
      lettering in the artwork, about 3 s").
- [ ] Listening checks handed to a human: the music start, any splice in the bed, the voice on the product
      name and on any line the transcription flagged, the level at the end card.
- [ ] `.DS_Store` removed; zipped with `/usr/bin/zip -r -X` (`delivery/zip.sh`).
- [ ] The package and its zip stay out of git (`.gitignore`), and are not uploaded anywhere without the
      owner's go-ahead.
