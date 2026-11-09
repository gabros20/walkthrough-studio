# Install research: one repo, six coding agents

All docs below were read on **2026-11-09**. Local checks ran the same day on macOS with Claude Code 2.1.319,
skills CLI 1.7.6, Codex CLI 0.163.0 and Hermes Agent 0.18.2. **UNVERIFIED** marks anything not confirmed by
a doc or a local run. The user's configs were left as found: Claude settings were diffed against a backup,
Codex ran with a throwaway `CODEX_HOME`, and the scratch dirs were deleted.

*Mode: explanation. The steps to follow are in [`INSTALL.md`](INSTALL.md). Since this was written, the
"Repo changes" at the end were made: `marketplace.json` (with `metadata.version`), the README install line,
the kit-location fallback in all 7 skills (replacing "two levels above this skill's base directory" quoted
below), the licence and the icon.*

## Compatibility matrix

| Platform | Route for this repo | Skills (7) | Agents (9) | CLAUDE.md / AGENTS.md | Kit tooling (`recorder/` …) | Verified |
|---|---|---|---|---|---|---|
| Claude Code | plugin marketplace (needs `marketplace.json`) or `--plugin-dir` | yes, `walkthrough-studio:<skill>` | yes, `walkthrough-studio:<agent>` | not loaded from a plugin | yes, whole repo copied to the plugin cache | local run |
| skills.sh (`npx skills`) | `npx skills add gabros20/walkthrough-studio` | yes, `SKILL.md` only | no | no | **no** | local run |
| OpenAI Codex | `codex plugin marketplace add` (reads `.claude-plugin/marketplace.json`) or skills.sh | yes | no (Codex agents are TOML) | its own AGENTS.md chain | plugin route yes, skills.sh no | install local; in-session UNVERIFIED |
| Hermes Agent | `hermes skills install` per skill, or skills.sh | yes | no | no | no | `inspect` local |
| Antigravity | skills.sh → `.agents/skills/` | yes | no (agents only in Antigravity plugins) | reads `AGENTS.md` | no | docs |
| Cursor | skills.sh → `.agents/skills/` (also reads `.claude/skills/`) | yes | copy `agents/*.md` to `.claude/agents/` or `.cursor/agents/` | reads `AGENTS.md` | no | docs |

## 1. Claude Code

**Docs** (`docs.anthropic.com/en/docs/claude-code/*` now redirects 301 to `code.claude.com/docs/en/*`):
[plugin-marketplaces](https://code.claude.com/docs/en/plugin-marketplaces),
[marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference.md),
[manifest reference](https://code.claude.com/docs/en/plugins-reference), [skills](https://code.claude.com/docs/en/skills),
[sub-agents](https://code.claude.com/docs/en/sub-agents), [org/project settings](https://code.claude.com/docs/en/plugins/org.md).

- **`--plugin-dir <kit>`** loads the plugin for one session as `walkthrough-studio@inline` (`inline` is reserved for this).
- **`marketplace.json`** at `.claude-plugin/` needs `name`, `owner.name` and `plugins[]`, and each entry needs
  `name` and `source`. A relative source must start with `./`. `"./"` or `"."` means the marketplace root, so one
  repo can be both marketplace and plugin. Other source types: `github`, `url`, `git-subdir`, `npm`, `archive`,
  `command`. Keep the entry `name` equal to the `plugin.json` `name`. Names may use only letters, digits, `.`, `_`
  and `-`. Reserved: `inline`, `skills-dir`, `github`, official names, and `<owner>-<repo>` (here
  `gabros20-walkthrough-studio`).
- **Namespacing:** "Plugin skills are namespaced as `/plugin-name:skill-name`". Agents become
  `my-plugin:code-reviewer`. Plugin agents ignore `hooks`, `mcpServers`, `permissionMode` and `initialPrompt`.
- "A `CLAUDE.md` at the plugin root isn't loaded as context" (manifest reference).
- **Project scope:** put `extraKnownMarketplaces` and `enabledPlugins` in the repo's `.claude/settings.json`. The
  marketplace registers only after the user trusts the folder. A relative-path plugin then loads from it:
  `{"extraKnownMarketplaces":{"walkthrough-studio":{"source":{"source":"github","repo":"gabros20/walkthrough-studio"}}},"enabledPlugins":{"walkthrough-studio@walkthrough-studio":true}}`.
  CLI equivalent: `claude plugin install walkthrough-studio@walkthrough-studio --scope project` (`claude plugin install --help`).

**Candidate `.claude-plugin/marketplace.json`.** It was tested locally and is not in the repo yet.

```json
{ "name": "walkthrough-studio",
  "description": "Walkthrough Studio: agent-driven toolkit for Screen-Studio-style walkthrough and tour videos.",
  "owner": { "name": "Tamás Gábor", "url": "https://github.com/gabros20" },
  "plugins": [ { "name": "walkthrough-studio", "source": "./",
    "description": "Record, edit, score, voice and package walkthrough videos of any web app or site: 7 skills and 9 review/production agents." } ] }
```

**Local verification.** The repo was copied without `node_modules` or `.git` (38 MB) to `<copy>`. This copy was
taken before another agent added `license` and `LICENSE`. Exact output:

```
$ claude plugin validate <copy>          # same verdict with and without marketplace.json
  ❯ root: CLAUDE.md at the plugin root is not loaded as project context. To ship context with your plugin, use a skill (skills/<name>/SKILL.md) instead.
✘ LICENSE: License missing (LICENSE_MISSING). This plugin has no LICENSE file and plugin.json has no `license`. The directory requires one of them.
⚠ .claude-plugin/plugin.json icon: No icon (ICON_MISSING).
ℹ Advice: README.md: This README has no line that installs "walkthrough-studio" from a marketplace. Add the install line, which works in one step on Claude Code 2.1.275 or later. ...
      /plugin install walkthrough-studio --marketplace <owner>/<repo>
✔ Validation passed with warnings        (exit 0)
$ claude plugin marketplace add <copy>
✔ Successfully added marketplace: walkthrough-studio (declared in user settings)
$ claude plugin install walkthrough-studio@walkthrough-studio
✔ Successfully installed plugin: walkthrough-studio@walkthrough-studio (scope: user)
$ claude plugin list
  ❯ walkthrough-studio@walkthrough-studio  Version: 0.1.0  Scope: user  Status: ✔ enabled
$ claude plugin details walkthrough-studio
  Skills (7)  build-film, deliver-package, film-sound, record-takes, review-film, voiceover, walkthrough-film
  Agents (9)  frame-describer, app-fixer, sound-designer, studio-builder, delivery-packager, film-critic, film-editor, take-operator, voiceover-producer
  Always-on: ~2,758 tok added to every session
$ claude -p … --output-format stream-json --verbose     # init event
  skills: walkthrough-studio:build-film … walkthrough-studio:walkthrough-film (7); agents: walkthrough-studio:app-fixer … (9)
$ claude plugin install walkthrough-studio --marketplace <copy>   # one step: added + installed (scope: user)
$ claude --plugin-dir <copy> -p …   # source "walkthrough-studio@inline", same 7 skills and 9 agents
$ claude plugin uninstall … / marketplace remove …   → ✔ Successfully uninstalled / ✔ Successfully removed
```

Uninstalling left `~/.claude/plugins/cache/walkthrough-studio/` behind (38 MB, a full copy of the repo), so it was
deleted by hand. Installing from the real GitHub source is **UNVERIFIED** until `marketplace.json` is pushed.

**One-liners:** `claude plugin install walkthrough-studio --marketplace gabros20/walkthrough-studio` (shell).
In a session: `/plugin marketplace add gabros20/walkthrough-studio`, then `/plugin install walkthrough-studio@walkthrough-studio`.
For one session: `git clone https://github.com/gabros20/walkthrough-studio && claude --plugin-dir ./walkthrough-studio`.
**User gets:** 7 skills, 9 agents and the full kit under `${CLAUDE_PLUGIN_ROOT}`. CLAUDE.md is not loaded.
**Repo must add or change:** `marketplace.json` (above). The validator's README line
`/plugin install walkthrough-studio --marketplace gabros20/walkthrough-studio`. `license` and `LICENSE`, which now
exist in the working tree, uncommitted. Optionally a 512–2048 px `.claude-plugin/icon.png`. Move any CLAUDE.md
guidance plugin users need into `walkthrough-film`. Have the skills name the kit root as `${CLAUDE_PLUGIN_ROOT}`,
which is substituted in skill bodies: the cache directory changes per version, and `npm run setup` has to run there.

## 2. skills.sh / Agent Skills open standard

**Docs:** [agentskills.io/specification](https://agentskills.io/specification), [vercel-labs/skills](https://github.com/vercel-labs/skills),
[docs/agents.md](https://raw.githubusercontent.com/vercel-labs/skills/main/docs/agents.md),
[docs/creating-skills.md](https://raw.githubusercontent.com/vercel-labs/skills/main/docs/creating-skills.md).

- **Spec:** `name` is required: 1–64 characters, lowercase `a-z0-9-`, no leading, trailing or double hyphen, and it
  must match the folder. `description` is required, 1–1024 characters. Optional fields: `license`,
  `compatibility` (≤500), `metadata`, `allowed-tools`. Keep the body under 500 lines. **All 7 of ours pass:** names
  match their folders, the longest description is `walkthrough-film` at 909 characters, the longest file is 154
  lines, and the frontmatter has only `name` and `description`.
- **Discovery:** root `SKILL.md`, skill containers (walked 3 levels deep), and `.claude-plugin/marketplace.json` or
  `plugin.json` when present. `--full-depth` searches everything. `metadata.internal: true` hides a skill.
- **Flags (v1.7.6):** `-g`, `-a/--agent` (`'*'` = all), `-s/--skill`, `-l/--list`, `-y`, `--copy` (the default is a
  symlink), `--all`, `--json`. `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1` turns telemetry off. There are 80 agent ids.
- **Paths (project / global):** claude-code `.claude/skills/` / `~/.claude/skills/`. codex `.agents/skills/` /
  `~/.agents/skills/`. cursor `.agents/skills/` / `~/.cursor/skills/`. antigravity `.agents/skills/` /
  `~/.gemini/config/skills/`. hermes-agent `.hermes/skills/` / `~/.hermes/skills/`. gemini-cli `.agents/skills/` /
  `~/.gemini/skills/`.

**Local verification** (exact output, ANSI codes stripped):

```
$ npx skills add gabros20/walkthrough-studio --list
◇  Source: https://github.com/gabros20/walkthrough-studio.git
◇  Repository cloned
◇  Found 7 skills   (build-film, deliver-package, film-sound, record-takes, review-film, voiceover, walkthrough-film)
$ npx skills add gabros20/walkthrough-studio -y --agent claude-code codex cursor antigravity hermes-agent gemini-cli
◇  Installed 7 skills
│  ✓ ./.agents/skills/build-film
│    universal: Codex, Cursor, Antigravity, Gemini CLI
│    symlinked: Claude Code, Hermes Agent        (same for all 7)
└  Done!  Review skills before use; they run with full agent permissions.
```

Files written: `.agents/skills/<7>/SKILL.md`, `.claude/skills/<7>` and `.hermes/skills/<7>` (the last two are
symlinks to `../../.agents/skills/<name>`), and `skills-lock.json` (source, `skillPath` and `computedHash` per skill).
**Only `SKILL.md` was copied**, because our skill folders hold nothing else. The scratch dir was deleted.

**One-liner:** `npx skills add gabros20/walkthrough-studio` (interactive). In scripts, use `-y -a <agent>` or `--all`.
**User gets:** the 7 skills only. Lost: `agents/*.md`, CLAUDE.md/AGENTS.md, and all the kit tooling
(`recorder/ film/ sound/ voiceover/ delivery/ studio/`, `npm run setup`).
**Repo must add or change:** the skills locate the kit "two levels above this skill's base directory". After a
skills.sh install, that location is `.agents/` or `.claude/` in the user's project, and no kit is there. Add a
fallback chain: `${CLAUDE_PLUGIN_ROOT}`, then `$WALKTHROUGH_STUDIO_HOME`, then `~/walkthrough-studio`. If none
exists, ask the user to run
`git clone https://github.com/gabros20/walkthrough-studio ~/walkthrough-studio && cd ~/walkthrough-studio && npm run setup`.
Optionally add `compatibility:` (Node 22+, ffmpeg, the kit checkout).
**Gaps:** no subagents. The roles and the model-tier routing reach other platforms only as prose in `walkthrough-film`.

## 3. OpenAI Codex (CLI and IDE)

**Docs:** `developers.openai.com/codex/skills` and `/codex/plugins` redirect 308 to
[learn.chatgpt.com/docs/build-skills](https://learn.chatgpt.com/docs/build-skills) and [/docs/plugins](https://learn.chatgpt.com/docs/plugins).
Also read: [plugin packaging](https://developers.openai.com/plugins/build/plugins),
[AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md.md),
[subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents.md).

- **Skills:** `.agents/skills` from the cwd up to the repo root, then `$HOME/.agents/skills` and `/etc/codex/skills`.
  Codex follows symlinks. Invoke with `/skills` or `$name`, or let Codex pick one implicitly. The startup list is
  capped at 2% of the context window or 8,000 characters, so long descriptions get shortened. `$skill-installer`
  installs skills. The docs do not list `~/.codex/skills`.
- **Plugins** bundle skills, MCP, hooks and assets, and the docs list no agents. Repo marketplace:
  `.agents/plugins/marketplace.json`. The docs say: "The ChatGPT desktop app can read
  `$REPO_ROOT/.claude-plugin/marketplace.json`" as legacy-compatible, and "OpenAI also accepts legacy and
  Claude-compatible manifests". The IDE extension does not support plugins.
- **AGENTS.md:** `~/.codex/AGENTS.md`, then root→cwd (with `AGENTS.override.md`), 32 KiB cap. `CLAUDE.md` is read
  only via `project_doc_fallback_filenames`. **Custom agents** are TOML in `.codex/agents/`, which is not
  compatible with our `.md` agents.

**Local verification** with an isolated `CODEX_HOME`, against `<copy>` plus the candidate `marketplace.json`:

```
$ codex plugin marketplace add <copy>   → Added marketplace `walkthrough-studio` from <copy>.
$ codex plugin list   → Marketplace `walkthrough-studio` <copy>/.claude-plugin/marketplace.json … not installed
$ codex plugin add walkthrough-studio@walkthrough-studio
Added plugin `walkthrough-studio` from marketplace `walkthrough-studio`.
Installed plugin root: $CODEX_HOME/plugins/cache/walkthrough-studio/walkthrough-studio/0.1.0   (full repo copy)
```

Codex accepts our Claude manifests as they are. Whether the skills appear inside a Codex session is **UNVERIFIED**
(no authenticated run).
**One-liners:** `codex plugin marketplace add gabros20/walkthrough-studio && codex plugin add walkthrough-studio@walkthrough-studio`
(the GitHub source is UNVERIFIED until it is pushed). Skills only: `npx skills add gabros20/walkthrough-studio -a codex`.
**User gets:** skills, plus the kit with the plugin route. No agents, and our AGENTS.md is not loaded.
**Repo must add or change:** `marketplace.json` (shared with Claude Code). Optionally a native `.codex-plugin/plugin.json`.
**Gaps:** agents are Claude-only.

## 4. Hermes Agent (Nous Research)

**Docs:** [hermes-agent.nousresearch.com/docs/user-guide/features/skills](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills)
(the canonical URL is inferred), plus `hermes skills --help` (v0.18.2).

- Skills live in `~/.hermes/skills/`. `skills.external_dirs` in `~/.hermes/config.yaml` adds folders. Each skill
  becomes a slash command (`/walkthrough-film`). Extra frontmatter: `platforms`, `metadata.hermes.*`,
  `required_environment_variables`.
- Identifiers: `skills-sh/owner/repo/skill`, `owner/repo/path`, a `SKILL.md` URL, `well-known:` and others.
  Installs are **per skill**, and no whole-repo install is documented. `hermes skills tap add owner/repo` scans
  the repo's `skills/` for browsing.
- **Local (read-only):** `hermes skills inspect` resolved `walkthrough-film` from all three identifiers
  `gabros20/walkthrough-studio/skills/walkthrough-film`, `gabros20/walkthrough-studio/walkthrough-film` and
  `skills-sh/gabros20/walkthrough-studio/walkthrough-film`. Nothing was installed.

**One-liners:** `npx skills add gabros20/walkthrough-studio -a hermes-agent -g`. Native:
`hermes skills install gabros20/walkthrough-studio/skills/<skill>`, once for each of the 7 skills. **Best with the
kit:** `git clone` the kit to `~/walkthrough-studio` and add `~/walkthrough-studio/skills` to `skills.external_dirs`.
Then "two levels up" resolves to the kit.
**User gets:** skills only. **Repo:** the kit-location fallback. Optionally `platforms: [macos, linux]`.
**Gaps:** no agents. Bulk install through `tap` is UNVERIFIED.

## 5. Google Antigravity

**Docs:** [antigravity.google/docs/skills](https://antigravity.google/docs/skills), [/docs/plugins](https://antigravity.google/docs/plugins),
[/docs/rules](https://antigravity.google/docs/rules).

- Skills: `.agents/skills/` (the legacy `.agent/skills/` still works), global `~/.gemini/config/skills/` (the legacy
  `~/.gemini/antigravity/skills/` is still read). `description` is required. `name` is optional and defaults to
  the folder. Invoke with `/<skill-name>`.
- Rules: `.agents/rules/*.md` and `~/.gemini/GEMINI.md`. **AGENTS.md is read** from the workspace and its parent
  folders and from `~/.gemini/AGENTS.md`.
- Plugins: a root `plugin.json` or `.antigravity-plugin/plugin.json`. They bundle skills, MCP, custom agents and
  subagents, rules and hooks. Install with `agy plugin install https://github.com/<owner>/<repo>`.
  `agy plugin import claude` migrates plugins from `~/.claude/plugins/`. Whether `.claude-plugin/plugin.json` is
  accepted directly is **UNVERIFIED** (`agy` is not installed here).

**One-liner:** `npx skills add gabros20/walkthrough-studio -a antigravity`. It writes `.agents/skills/` and was
verified in section 2.
**User gets:** skills only. **Repo:** the kit-location fallback. A native `.antigravity-plugin/plugin.json` would
be needed to ship agents. **Gaps:** no agents.

## 6. Cursor

**Docs:** [cursor.com/docs/skills.md](https://cursor.com/docs/skills.md), [/docs/plugins.md](https://cursor.com/docs/plugins.md),
[/docs/rules.md](https://cursor.com/docs/rules.md), [/docs/subagents.md](https://cursor.com/docs/subagents.md)
(the `/docs/context/*` URLs serve these pages).

- Skills: `.agents/skills/` and `.cursor/skills/` in the project, `~/.agents/skills/` and `~/.cursor/skills/` for
  the user, and also `.claude/skills/` and `.codex/skills/` (and their `~` forms). `name` must match the folder.
- Subagents: `.cursor/agents/*.md`. **Cursor also reads `.claude/agents/` and `~/.claude/agents/`.** Frontmatter:
  `name`, `description`, `model` (`inherit` or an id), `readonly`, `is_background`. Whether our `model: opus` and
  `model: haiku` values work in Cursor is **UNVERIFIED**.
- Rules: `.cursor/rules/*.mdc` (a plain `.md` is ignored). AGENTS.md is supported at the root and in subfolders.
  CLAUDE.md is not mentioned.
- Plugins: `.cursor-plugin/plugin.json` (only `name` is required) and `.cursor-plugin/marketplace.json`. "From
  GitHub Repository" requires `.cursor-plugin/marketplace.json`. `.claude-plugin` support is not documented (UNVERIFIED).

**One-liner:** `npx skills add gabros20/walkthrough-studio -a cursor`, verified in section 2. Agents:
`git clone https://github.com/gabros20/walkthrough-studio ~/walkthrough-studio && mkdir -p ~/.cursor/agents && cp ~/walkthrough-studio/agents/*.md ~/.cursor/agents/`.
This copy is UNVERIFIED in a live Cursor.
**User gets:** skills, plus agents if copied by hand. **Repo:** the kit-location fallback. For a native install,
`.cursor-plugin/plugin.json` and `marketplace.json`. **Gaps:** the agents' `tools:` and `model:` fields are Claude-specific.

## Repo changes, in priority order

1. `.claude-plugin/marketplace.json` with `"source": "./"`. Claude Code and Codex install from it.
2. The validator's README line: `/plugin install walkthrough-studio --marketplace gabros20/walkthrough-studio`.
3. A kit-location fallback in the skills (`${CLAUDE_PLUGIN_ROOT}`, then `$WALKTHROUGH_STUDIO_HOME`, then `~/walkthrough-studio`, then clone).
4. Commit `license` and `LICENSE`. Optionally add an icon. Agents stay Claude-only, and each other platform would need its own packaging.
