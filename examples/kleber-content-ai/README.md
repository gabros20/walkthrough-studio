# Example: Kleber Content AI walkthrough (studio mode, both twins)

The project files of the first film made with this kit (6-9 November 2026). They are a worked example to
copy from, not something to run as is: they need the app, its studio instance, the takes and the client's
logo files, none of which are in this repo.

| Read | For |
|---|---|
| `PLAN.md` | the approved plan: the best template for a new one |
| `README-recorder-notes.md` | `walkthrough.config.mjs`, `app.mjs` (adapter), `scenes.mjs`, `take-5b.mjs`, `selftest-app.mjs`, `studio.config.sh` |
| `README-film-notes.md` | `storyboard.json`, `brand.json`, `creatives.json`, `captions.srt`, `music.json`, `beat-grid.json`, `voiceover/` |
| `delivery/` | the package config, README, copy files and file manifest of the delivered package |
| `agent-briefs/` | every brief and follow-up the lead sent; paths in them are the original machine's, kept as a record |

## Environment variables

Nothing in the example holds an absolute path; the machine-specific locations come from these:

| Variable | Used by | Points at | Default |
|---|---|---|---|
| `KLEBER_REPO` | `brand.json` (logo files), `delivery/package.config.json` (films, subtitles, EDLs, logo) | a `kleber-content-ai` checkout holding `videos/` and `apps/web/public/brand/` | none: the delivery scripts stop with "unset environment variable" |
| `KLEBER_STUDIO` | `walkthrough.config.mjs`, `studio.config.sh` | the studio folder (takes, checkpoints, clone) | `~/Documents/Work/Projects/kleber-content-ai-studio` |
| `KLEBER_SOURCE` | `studio.config.sh` | the app repo the studio clones | `~/Documents/Work/Projects/kleber-content-ai` |

`${VAR}` in `brand.json` and `package.config.json` paths is expanded by `film/scripts/sync-assets.mjs` and
`delivery/lib.py`. Example check of the delivery config without encoding anything:

```bash
KLEBER_REPO=<kleber-content-ai checkout> python3 -I delivery/clips.py examples/kleber-content-ai/delivery/package.config.json --dry
```

The demo company (Summit Tyre Centre, `sam@summit-tyre.example`) and the other dealers are fictional.
