# delivery/

Scripts that build the delivery package for a finished walkthrough film. The package layout, naming,
encodes and review checklist are in `docs/DELIVERY.md`; the workflow is the `deliver-package` skill.

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
| `verify.py CONFIG [--loudness]` | package checks; exits non-zero on a silent video, a changed master, bad VTT | ffmpeg |
| `zip.sh DIR [ZIP]` | removes `.DS_Store`, zips with `/usr/bin/zip -r -X`, prints size and count | — |
| `lib.py` | shared helpers (config, EDL scene spans incl. title/end, SRT parsing, ffprobe) | — |

Run the Python scripts with `python3 -I` (isolated mode); they add their own folder to the import path.

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

## Templates

The copy documents are written per project by the `delivery-packager` agent in copy mode. Start from the
real ones in `examples/brightpost/delivery/` (`README.md`, `05_Copy/*.md`,
`04_Creative-Showcase/README.md`): keep their structure, replace every fact, and verify each number again.
