# delivery/

Scripts that build the delivery package for a finished walkthrough film. The package layout, naming,
encodes and review checklist are in `docs/DELIVERY.md`; the workflow is the `deliver-package` skill.

**Presets** (`presets.json`, run by `run_preset.py` or `walkthrough deliver --preset <name>`) build a whole
output from a project's renders in one command: `sales` (the full package below), `web`, `social` and `docs`.
What each makes and needs: `docs/DELIVERY.md`, Presets.

```bash
python3 -I delivery/run_preset.py web    --project <project>                 # or: walkthrough deliver --preset web
python3 -I delivery/run_preset.py docs   --project <project> --render final
python3 -I delivery/run_preset.py social --project <project> --render final-vo
python3 -I delivery/run_preset.py sales  --project <project> [--config package.config.json]
```

The single scripts below are what the presets call; use them directly to redo one part.
Everything is driven by one `package.config.json`. The real one is
`examples/brightpost/delivery/package.config.json`; copy it and change the paths.

| Script | Does | Needs |
|---|---|---|
| `films.py CONFIG [--skip-web] [--only V]` | 01_Films: byte-copied masters (sha256 checked), `.srt` + `.vtt`, poster JPG, web encodes 1080p30 and 720p30 | ffmpeg |
| `clips.py CONFIG [--dry]` | 02_Feature-Clips: one clip per feature from `edl.json` scene ids, frame-accurate re-encode, 0.3 s audio fades, never cuts a spoken line | ffmpeg |
| `stills.py CONFIG` | 03_Screenshots: PNG stills at named times, cropped (`full`, `band`, `window`, or a box); full frames in `full-frame-16x9/` | ffmpeg, Pillow |
| `contact_sheet.py VIDEO DIR (--every S \| --at t1,t2)` | time-stamped contact sheets and strips for reviewing (no `drawtext` needed) | ffmpeg, Pillow |
| `showcase_sheet.py SHEET.json OUT.png [--jpg]` | a branded showcase sheet: justified rows that keep each format's shape | Pillow |
| `md2html.py README.md README.html [--config CONFIG]` | self-contained branded HTML (logo and fonts embedded) | — |
| `html2pdf.mjs README.html README.pdf [preview.png]` | A4 PDF with backgrounds, via Playwright Chromium | Playwright (from `recorder/`) |
| `inventory.py DIR` | Markdown listing of every file with duration or pixel size and size | ffprobe |
| `verify.py CONFIG [--loudness]` / `verify.py --dir DIR [--allow-silent] [--max-gif-mb 8]` | package checks; exits non-zero on a silent video, a changed master, bad VTT, a GIF over budget, a file that does not match `MANIFEST.txt` | ffmpeg |
| `zip.sh DIR [ZIP]` | removes `.DS_Store`, zips with `/usr/bin/zip -r -X`, prints size and count | — |
| `run_preset.py PRESET [--project DIR] [--render N] [--vo-render N\|none] [--video F] [--out DIR] [--config C] [--zip] [--burn\|--no-burn] [--allow-silent] [--out-root DIR] [--report FILE]` | one preset end to end (`--out-root`: the default folder under DIR, used when the CLI spills to a buffer; `--report`: a JSON summary); prints every command (`›`), writes `MANIFEST.txt`, runs `verify.py` | ffmpeg; Pillow (stills, sheets, caption plates); Playwright for the PDF |
| `presets.json` | the presets' numbers: encodes, poster time, 60 s social cap, 10-30 s docs range, GIF size ladder, caption plate size | — |
| `templates/` | the README, `05_Copy` and showcase README skeletons `sales` fills in (marked TODO) | — |
| `lib.py` | shared helpers (config, EDL scene spans incl. title/end, scene groups, SRT parsing and slicing, ffprobe, MANIFEST) | — |

Run the Python scripts with `python3 -I` (isolated mode); they add their own folder to the import path. Every
script answers `--help`. With `WALKTHROUGH_ECHO=1` (set by `run_preset.py` and the CLI) each ffmpeg command is
printed before it runs.

## Config

```json
{
  "product": "Product-Name",
  "out": "../out/Product-Name_Demo-Package",
  "brand": {"name": "Brand", "accent": "#0E7C86", "ink": "#141414", "paper": "#F4F2EE",
            "logo": "path/logo-black.png", "fonts": {"400": "path/font-400.woff2", "700": "path/font-700.woff2"},
            "eyebrow": "Demo package", "footer": "Product demo package · Month Year"},
  "films": [
    {"variant": "Captions",  "master": "...mp4", "srt": "...srt", "edl": "...edl.json", "poster_t": 6.0},
    {"variant": "Voiceover", "master": "...mp4", "srt": "...srt", "edl": "...edl.json", "poster_t": 6.0, "speech": true}
  ],
  "clips":  [{"name": "00_Title", "scenes": ["title"]}, {"name": "03_Choose-and-edit", "scenes": ["s3a", "s3b"]}],
  "stills": {"from": "Voiceover", "crop": {"band": 180, "window": [192, 36, 1536, 864], "margin": 24},
             "items": [{"name": "02b_Ask_Three-options", "t": 37.8, "crop": "band"}]}
}
```

Relative paths resolve against the config file's folder. Scene ids are those in the film's `edl.json`;
`title` (0 to the first scene) and `end` (last scene's end to the film's end) are added automatically.

Optional, for the showcase: `"showcase": {"creatives": "path/to/creatives", "sheets": ["sheet.json"], "readme": "README.md"}`.
`sales` copies the creatives folder, writes `index.csv` (file, campaign, pixel size, bytes) and renders each sheet
with `showcase_sheet.py`; with no sheets it makes one 16:9 overview of up to 24 images.

## Templates

`run_preset.py sales` writes the README and `05_Copy` from `templates/` (product name, folder table, presenter
time table and slide list filled in; the rest marked TODO), and `Film-captions.md` / `Voiceover-script.md` from the
`.srt` files word for word. Files the project already has in `<project>/delivery/README.md` and
`<project>/delivery/05_Copy/*.md` are used instead. `verify.py` lists every TODO left.

The copy documents are written per project by the `delivery-packager` agent in copy mode. Start from the
real ones in `examples/brightpost/delivery/` (`README.md`, `05_Copy/*.md`,
`04_Creative-Showcase/README.md`): keep their structure, replace every fact, and verify each number again.
