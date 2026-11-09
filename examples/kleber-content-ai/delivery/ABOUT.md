# The real delivery package (worked example)

What was sent to the project manager on 6 November 2026, minus the media. Use these files as templates for
the written part of a new package; replace every fact and verify each number again.

| File | What it is |
|---|---|
| `README.md` | the package README (rendered to `README.html` and `README.pdf` with `delivery/md2html.py` and `delivery/html2pdf.mjs`) |
| `05_Copy/*.md` | key messages, facts and figures with code references, film captions and voiceover script with times, presenter notes, slide copy |
| `04_Creative-Showcase/README.md` | how the showcase was sourced and curated, and what was left out |
| `04_Creative-Showcase/index.sample.csv` | the first rows of the creatives index (columns to reuse) |
| `MANIFEST.txt` | every file in the package (361 files in the zip, about 417 MB) |
| `package.config.json` | reproduces `01_Films`, `02_Feature-Clips` and `03_Screenshots` from the two films with the `delivery/` scripts; the source paths are the author's machine |

How the package was made: two agents in parallel (`agent-briefs/14-*` for media on Sonnet, `15-*` for the
showcase and copy on Opus); the lead reviewed the hero and languages sheets, removed `.DS_Store` files and
zipped with `/usr/bin/zip -r -q -X`. The showcase sheets were HTML pages laid out in Python and rendered to
PNG and PDF with Playwright (Roboto, the real Kleber logo files); `delivery/showcase_sheet.py` is the
dependable Pillow-only version of that idea.

Known flaws listed in the handover: 2:37-2:40 the dealer logo sits over lettering in the artwork of the
second campaign's option 1 (about 3 s, both films); nobody had listened to the audio; the ElevenLabs licence
for commercial use was an open check for the owner.
