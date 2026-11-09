# Example: Brightpost walkthrough (studio mode, both twins)

The project files of the first film made with this kit (6-9 November 2026). The kit was extracted from a
real client walkthrough job; the example here is anonymised as Brightpost, a fictional marketing-post
studio for independent shops. The files are a worked example to copy from, not something to run as is:
they need the app, its studio instance, the takes and the app's logo files, none of which are in this
repo.

| Read | For |
|---|---|
| `PLAN.md` | the approved plan: the best template for a new one |
| `README-recorder-notes.md` | `walkthrough.config.mjs`, `app.mjs` (adapter), `scenes.mjs`, `take-5b.mjs`, `selftest-app.mjs`, `studio.config.sh` |
| `README-film-notes.md` | `storyboard.json`, `brand.json`, `creatives.json`, `captions.srt`, `music.json`, `beat-grid.json`, `voiceover/` |
| `delivery/` | the package config, README, copy files and file manifest of the delivered package |

## Environment variables

Nothing in the example holds an absolute path; the machine-specific locations come from these:

| Variable | Used by | Points at | Default |
|---|---|---|---|
| `BRIGHTPOST_REPO` | `brand.json` (logo files), `delivery/package.config.json` (films, subtitles, EDLs, logo) | a `brightpost` checkout holding `videos/` and `public/brand/` | none: the delivery scripts stop with "unset environment variable" |
| `BRIGHTPOST_STUDIO` | `walkthrough.config.mjs`, `studio.config.sh` | the studio folder (takes, checkpoints, clone) | `~/Projects/brightpost-studio` |
| `BRIGHTPOST_SOURCE` | `studio.config.sh` | the app repo the studio clones | `~/Projects/brightpost` |

`${VAR}` in `brand.json` and `package.config.json` paths is expanded by `film/scripts/sync-assets.mjs` and
`delivery/lib.py`. Example check of the delivery config without encoding anything:

```bash
BRIGHTPOST_REPO=<brightpost checkout> python3 -I delivery/clips.py examples/brightpost/delivery/package.config.json --dry
```

The demo shop (Harbor Bikes, owner Sam, `sam@harbor-bikes.example`) and the other shops are fictional.
