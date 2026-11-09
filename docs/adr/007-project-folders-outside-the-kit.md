# ADR-007: Each film lives in a project folder outside the kit; the kit is read-only in use

## Status

Accepted

## Date

2026-11-09

## Context

On the first job the film kit and the film were one folder: the build wrote `index.html`, compositions,
clips and renders into `film/`. Extracting the kit as a Claude Code plugin broke that: an installed plugin
sits in a cache that may be read-only, two films made with the same kit would overwrite each other, and a kit
update would touch a render already in progress.

## Decision

A film is a **project folder outside the kit** that holds its inputs (`storyboard.json`, `brand.json`,
`creatives.json`, `music.json`, `voiceover/`) and receives every output (`index.html`, `compositions/`,
`assets/`, `cues.json`, `edl.json`, `captions.srt`, `renders/`, `sound-build/`, `out/`). It is a HyperFrames
project of its own, so `check` and `render` run inside it.

`film/scripts/init-project.mjs <dir>` makes one (it refuses a folder inside the kit's `film/`); `build.mjs`
adds any missing project file. Every kit command finds the project the same way (`film/lib/config.mjs`,
`PROJECT_DIR`), first match wins: `--project <dir>`, `FILM_PROJECT`, the storyboard's folder when it has
`hyperframes.json`, the current directory when it holds `storyboard.json` or `hyperframes.json`, else the
kit's own `film/` (developing the kit). The sound build uses the same order without the storyboard step
(`--project` or `--film`, `FILM_PROJECT`, the current directory, else `../film` next to `sound/`).

## Alternatives considered

### Keep writing into the kit's `film/`

- Rejected: fails in a read-only plugin cache and allows only one film at a time.

### Copy the kit into each film

- Cons: every film carries its own drifting copy; kit fixes never reach it.
- Rejected.

## Consequences

- Kit commands run from the project folder, or take `--project $P` / `FILM_PROJECT=$P`.
- The project records where the kit is (`kit.json`); `film/` and `recorder/` must stay side by side because
  the pointer code imports `../../recorder/motion.mjs`.
- Running a kit command outside any project silently falls back to the kit's `film/` (dev mode), so its
  outputs land in the kit: run from `$P` or pass `--project`.
- The recorder side follows the same idea: takes go to the config's `takesDir`, never inside
  `recorder/takes/` (which is code), and project configs live with the project.
- Details: [`film/README.md`](../../film/README.md), Projects.
