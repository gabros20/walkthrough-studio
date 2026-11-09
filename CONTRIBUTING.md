# Contributing

Thanks for helping. This kit makes walkthrough and tour films of web apps with agents; it is also a Claude
Code plugin. Bug reports, fixes, docs and new tools are all welcome. By taking part you agree to the
[code of conduct](CODE_OF_CONDUCT.md). Security problems go through [SECURITY.md](SECURITY.md), not issues.

## Get set up

You need Node 24 (`.nvmrc`; 22 is the minimum), Python 3, `bash`, and for recording and rendering `ffmpeg`
and Chromium (`npm run setup` installs the recorder's). The README's prerequisites list the rest.

```sh
git clone https://github.com/gabros20/walkthrough-studio.git && cd walkthrough-studio
npm run setup        # only if you will record
npm run check        # should pass before you change anything
```

## Checks

| Command | What it runs | When |
|---|---|---|
| `npm run check` | `node --check` on every `.mjs`, Python syntax of every `.py`, `bash -n` on every `.sh`, `JSON.parse` of every `.json`, skill and agent frontmatter, the same version in every manifest, and `claude plugin validate . --profile directory` (skipped with a message when `claude` is not on your PATH) | every PR |
| `npm run lint:skills` | the frontmatter check on its own | after editing `skills/` or `agents/` |
| `npm run check:site` | `npm ci && npm run build` in `site/` | when `site/` changed |

CI runs the same three as the jobs `check`, `skills-lint` and `site` on every pull request; `check` and
`site` must pass before a merge. These checks are about syntax and structure. They do not record, render or
mix anything, so the per-area checks in [`CLAUDE.md`](CLAUDE.md) ("Before claiming done") still apply: run a
changed script on real or sample input (or its `--dry`/`--help`) and read the output.

## Where things live

[`docs/README.md`](docs/README.md) lists every doc by purpose, and the table in [`CLAUDE.md`](CLAUDE.md)
lists every folder. In short: `recorder/` records takes, `film/` builds the HyperFrames film, `sound/` and
`voiceover/` make the audio, `delivery/` builds the package, `studio/` runs an isolated app instance,
`skills/` and `agents/` are the plugin, `site/` is the website, `examples/brightpost/` is the worked example.
Hard-to-reverse choices are recorded in [`docs/adr/`](docs/adr/); do not reverse one without a new ADR that
supersedes it.

## Add a skill

1. Create `skills/<name>/SKILL.md`; `<name>` is lowercase-kebab-case and the folder name.
2. Start it with frontmatter whose `name` equals the folder and whose `description` says what the skill does
   and when to use it (Claude reads the description to decide when to load it):

   ```markdown
   ---
   name: my-skill
   description: Do X for a walkthrough film - ... Use when ..., and after ...
   ---
   ```

3. Keep the body a procedure an agent can follow; link to `docs/` for reference material instead of copying it.
   Copy the **Where the kit is** paragraph from any other skill unchanged (the lint checks it is identical),
   write kit paths through `$KIT`, and keep the description at most 1024 characters. A skills.sh install
   copies the `SKILL.md` alone, without the agents or the kit ([`docs/INSTALL.md`](docs/INSTALL.md)).
4. Add it to the skills table in `README.md` and to the how-to table in `docs/README.md`.
5. `npm run check` (frontmatter and `claude plugin validate`).

## Add an agent

1. Create `agents/<name>.md` with `name` (equal to the file name), `description` (what it does and when the
   lead should spawn it) and `model` (`opus`, `sonnet`, `haiku` or `inherit`):

   ```markdown
   ---
   name: my-agent
   description: Does Y. Use when ... Not for ...
   model: sonnet
   ---
   ```

2. Pick the tier by the work, as [ADR-008](docs/adr/008-model-tier-orchestration.md) explains: Opus for
   complex code and client-facing text, Sonnet for mechanical self-checking work, Haiku for factual read-back.
3. Add it to the agents table in `README.md`, and to the skill that spawns it, with the fallback for
   platforms without sub-agents: "(or, without sub-agents, do that role's checklist yourself: see
   `agents/<name>.md` in the kit)".
4. `npm run check`.

## Add a tool or script

- Put it in the folder of the stage it serves (`recorder/tools/`, `film/scripts/`, `delivery/`, ...). Node
  scripts are ES modules (`.mjs`); Python is stdlib-only unless the folder already uses something else, and
  runs with `python3 -I`.
- It answers `--help`, and anything that writes or spends money has `--dry`.
- It never prints secret values, and it reads paths from arguments or the project folder, not from the kit
  (the kit stays read-only in use; see [ADR-007](docs/adr/007-project-folders-outside-the-kit.md)).
- Document it in the folder's `README.md` (the reference) and, if it changes how a job runs, in the skill
  that uses it.

## Docs: one purpose per doc

The docs follow [Diátaxis](https://diataxis.fr/). Each doc is a tutorial (learning), a how-to (a task), a
reference (lookup) or an explanation (why), never a mix. Put new material where its purpose is: a new
command's flags go in the folder's README (reference), the steps to use it in a skill or how-to, the reason
for it in an ADR or `PIPELINE.md`. Add new docs to `docs/README.md`.

## Keep the worked example fictional

The worked example is Brightpost, a fictional marketing-post studio, and its shop Harbor Bikes. Never add
client material: no real company or person names, footage, screenshots, brand assets, logos, fixtures,
briefs, URLs of private apps or delivery copy from a real job. Anonymise first, or do not add it. Media
(footage, renders, audio, packages) never goes into git at all; `.gitignore` covers it.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary` in the imperative, lower
case, no full stop. Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`. The
scope is the folder or area when it helps: `recorder`, `film`, `sound`, `voiceover`, `delivery`, `studio`,
`skills`, `agents`, `site`, `docs`. A breaking change gets `!` (`feat(recorder)!: ...`) and a
`BREAKING CHANGE:` footer. Examples:

```text
feat(recorder): add a tablet viewport preset
fix(site): remove the hairline under sloped section joins on phone
docs: explain the holds audit in STORYBOARD.md
```

## Pull requests

- One change per PR, from a branch; `main` only takes pull requests.
- The PR title is a conventional commit; PRs are squash-merged, so the title becomes the commit on `main`.
- Fill in the template: what and why, how you checked it.
- Add a line to `docs/CHANGELOG.md` under `## [Unreleased]` (Added, Changed, Removed or Fixed) for anything
  a user of the kit would notice.
- Update the docs that describe what you changed in the same PR.
- `check` and `site` must be green. A maintainer reviews; expect questions about how it was verified.

## Versions and releases

The kit uses [semantic versioning](https://semver.org/). One version is shared by
`.claude-plugin/plugin.json`, `package.json`, `recorder/package.json`, `film/package.json` and, when it
exists, `.claude-plugin/marketplace.json`; `npm run check` fails if they disagree. Do not edit them by hand:

```sh
node scripts/version.mjs 0.2.0 --dry    # show what would change
npm run version:set -- 0.2.0            # set it, move [Unreleased] into [0.2.0] - today
```

The script prints the rest: a release branch and PR, then after the merge `git tag -a v0.2.0` and
`git push origin v0.2.0`, which runs `.github/workflows/release.yml` to publish the GitHub Release with that
version's changelog section. The full procedure is in [`docs/MAINTAINERS.md`](docs/MAINTAINERS.md).

## Licence

MIT ([LICENSE](LICENSE)). By contributing you agree your contribution is licensed under it.
