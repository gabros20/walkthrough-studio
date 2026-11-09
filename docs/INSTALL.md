# Install

*Mode: how-to. Installing walkthrough-studio on Claude Code, any agent through skills.sh, Codex, Cursor,
Antigravity or Hermes, and getting the kit tooling the skills run. Why each route works the way it does, with
the commands and output it was verified with: [`INSTALL-RESEARCH.md`](INSTALL-RESEARCH.md).*

The repo holds three things: **7 skills** (`skills/*/SKILL.md`, the workflows), **9 agents** (`agents/*.md`,
the specialised roles with their model tiers) and **the kit** (`recorder/`, `film/`, `sound/`, `voiceover/`,
`delivery/`, `studio/`, `docs/`: the tools the skills run). Claude Code's plugin install gets all three; every
other route gets the skills, and you add the kit with one clone ([Get the kit tooling](#get-the-kit-tooling)).
**UNVERIFIED** marks a step not confirmed by a doc or a local run.

## Claude Code

Plugin install from this repo's own marketplace (`.claude-plugin/marketplace.json`). In a shell:

```bash
claude plugin install walkthrough-studio --marketplace gabros20/walkthrough-studio
```

The same in two steps, inside a session:

```text
/plugin marketplace add gabros20/walkthrough-studio
/plugin install walkthrough-studio@walkthrough-studio
```

The one-step form needs Claude Code 2.1.275 or later. You get the 7 skills as `walkthrough-studio:<skill>`,
the 9 agents as `walkthrough-studio:<agent>`, and the whole kit in the plugin cache, which the skills find as
`${CLAUDE_PLUGIN_ROOT}`. Run `npm run setup` there once, or let the `walkthrough-film` skill do it in its
preflight. The repo's `CLAUDE.md` is not loaded from a plugin; the skills carry the rules they need.

**One session, from a clone** (no install; the plugin shows as `walkthrough-studio@inline`):

```bash
git clone https://github.com/gabros20/walkthrough-studio && claude --plugin-dir ./walkthrough-studio
```

**For a whole team, project-scoped.** Commit this to your project's `.claude/settings.json`; everyone who
trusts the folder gets the marketplace and the plugin:

```json
{
  "extraKnownMarketplaces": {
    "walkthrough-studio": { "source": { "source": "github", "repo": "gabros20/walkthrough-studio" } }
  },
  "enabledPlugins": { "walkthrough-studio@walkthrough-studio": true }
}
```

Or from the CLI, once the marketplace is added: `claude plugin install walkthrough-studio@walkthrough-studio --scope project`.

Update with `claude plugin update walkthrough-studio`; remove with `claude plugin uninstall walkthrough-studio`
and `claude plugin marketplace remove walkthrough-studio`. Uninstalling may leave the cached copy under
`~/.claude/plugins/cache/walkthrough-studio/`; delete it by hand if you want the space back.

> [!NOTE]
> Every step above was run against a local copy of this repo. Installing from the GitHub source is
> **UNVERIFIED** until `marketplace.json` is on the default branch.

## Any agent via skills.sh

The [skills CLI](https://github.com/vercel-labs/skills) installs the 7 skills into any of 80 agents (Claude
Code, Codex, Cursor, Antigravity, Gemini CLI, Hermes, ...). Interactive:

```bash
npx skills add gabros20/walkthrough-studio
```

In scripts: `npx skills add gabros20/walkthrough-studio -y -a <agent>` (several agents: `-a claude-code codex
cursor`; every agent: `-a '*'` or `--all`). Useful flags: `-g` installs for your user instead of the project,
`-s <skill>` picks skills, `-l` lists them without installing, `--copy` copies instead of symlinking.
`DISABLE_TELEMETRY=1` turns telemetry off.

You get the skills only: each `SKILL.md` lands in `.agents/skills/<name>/` (or the agent's own folder) and a
`skills-lock.json` records the source. You do **not** get the agents, `CLAUDE.md`/`AGENTS.md` or the kit. The
skills notice that and ask you to [get the kit tooling](#get-the-kit-tooling); without sub-agents, the lead
does each role itself from `agents/<name>.md` in the kit.

## Codex

Codex reads this repo's Claude manifests as they are. Plugin install, which brings the whole kit:

```bash
codex plugin marketplace add gabros20/walkthrough-studio && codex plugin add walkthrough-studio@walkthrough-studio
```

Skills only: `npx skills add gabros20/walkthrough-studio -a codex` (into `.agents/skills/`; `-g` for
`~/.agents/skills/`), then [get the kit tooling](#get-the-kit-tooling).

Codex has no Markdown agents (its custom agents are TOML), so the lead does the roles itself. Our `AGENTS.md`
is not loaded from a plugin. Verified: the marketplace add and plugin install against a local copy.
**UNVERIFIED**: the install from GitHub, and that the skills appear inside a Codex session.

## Cursor

```bash
npx skills add gabros20/walkthrough-studio -a cursor
```

Skills go to `.agents/skills/` (Cursor also reads `.claude/skills/`). Then [get the kit
tooling](#get-the-kit-tooling). Cursor reads Markdown subagents from `.cursor/agents/` and `.claude/agents/`;
to have them, copy ours from the kit:

```bash
mkdir -p ~/.cursor/agents && cp ~/walkthrough-studio/agents/*.md ~/.cursor/agents/
```

**UNVERIFIED**: the agent copy in a live Cursor, and whether Cursor accepts our `model: opus` / `haiku` values
(set `model: inherit` if it does not). Cursor reads `AGENTS.md` at the project root.

## Antigravity

```bash
npx skills add gabros20/walkthrough-studio -a antigravity
```

Skills go to `.agents/skills/` (`-g`: `~/.gemini/config/skills/`) and run as `/<skill-name>`. Then [get the kit
tooling](#get-the-kit-tooling). Antigravity ships agents only inside its own plugins, so the lead does the
roles itself. **UNVERIFIED**: whether `agy plugin install` accepts this repo's `.claude-plugin/` directly.

## Hermes

Through skills.sh, for your user:

```bash
npx skills add gabros20/walkthrough-studio -a hermes-agent -g
```

Natively, once per skill (`build-film`, `deliver-package`, `film-sound`, `record-takes`, `review-film`,
`voiceover`, `walkthrough-film`):

```bash
hermes skills install gabros20/walkthrough-studio/skills/<skill>
```

Each skill becomes a slash command (`/walkthrough-film`). Simplest with the kit: clone it to
`~/walkthrough-studio` ([below](#get-the-kit-tooling)) and add `~/walkthrough-studio/skills` to
`skills.external_dirs` in `~/.hermes/config.yaml`; the skills then sit inside the kit and find it themselves.
No agents. Verified: `hermes skills inspect` resolves the identifiers. **UNVERIFIED**: the install itself, and
a bulk install through `hermes skills tap add gabros20/walkthrough-studio`.

## Get the kit tooling

Every route except a Claude Code or Codex plugin install copies only the `SKILL.md` files. The skills run the
kit's tools, so clone it once and install its dependencies:

```bash
git clone https://github.com/gabros20/walkthrough-studio ~/walkthrough-studio && cd ~/walkthrough-studio && npm run setup
```

`npm run setup` installs the recorder's dependencies and Playwright Chromium. The tools also need Node 22 or
newer, ffmpeg 8 and Python 3 with `numpy` and `Pillow` (full list: [README](../README.md#prerequisites)).

The skills look for the kit in this order and use the first folder that holds `recorder/` and `film/`:

1. `${CLAUDE_PLUGIN_ROOT}`: the plugin cache (Claude Code or Codex plugin install).
2. `$WALKTHROUGH_STUDIO_HOME`: set it if the kit lives anywhere else, e.g.
   `export WALKTHROUGH_STUDIO_HOME=~/code/walkthrough-studio` in your shell profile.
3. `~/walkthrough-studio`.
4. The skill's own folder, two up (`skills/<name>/../..`): a clone used in place, or skills linked from one.

If none holds the kit, the skill stops and asks you to run the clone above. Update the kit with
`git -C ~/walkthrough-studio pull && npm --prefix ~/walkthrough-studio run setup`.

## Compatibility

| Platform | Route | Skills (7) | Agents (9) | CLAUDE.md / AGENTS.md | Kit tooling | Verified |
|---|---|---|---|---|---|---|
| Claude Code | plugin marketplace, or `--plugin-dir` | yes, `walkthrough-studio:<skill>` | yes, `walkthrough-studio:<agent>` | not loaded from a plugin | yes, in the plugin cache | local run; GitHub source UNVERIFIED |
| skills.sh (`npx skills`) | `npx skills add gabros20/walkthrough-studio` | yes, `SKILL.md` only | no | no | no: clone it | local run |
| Codex | `codex plugin marketplace add`, or skills.sh | yes | no (Codex agents are TOML) | its own AGENTS.md chain | plugin route yes; skills.sh no | install local; in-session UNVERIFIED |
| Cursor | skills.sh → `.agents/skills/` | yes | copy `agents/*.md` to `.cursor/agents/` (UNVERIFIED) | reads `AGENTS.md` | no: clone it | docs |
| Antigravity | skills.sh → `.agents/skills/` | yes | no (only in Antigravity plugins) | reads `AGENTS.md` | no: clone it | docs |
| Hermes | `hermes skills install` per skill, or skills.sh | yes | no | no | no: clone it | `inspect` local; install UNVERIFIED |

Without agents, the skills still work: the lead does each role from `agents/<name>.md` in the kit, in order,
and the review step keeps its fresh critic pass. You lose the parallel describers and the model-tier savings,
not a step.
