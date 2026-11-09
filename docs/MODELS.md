# Model tiers on each agent

*Mode: reference. Which model runs each tier of the kit's orchestration on Claude Code, Codex, Antigravity,
Cursor and Hermes, and how to set it. Why there are tiers: [ADR-008](adr/008-model-tier-orchestration.md).
Every fact below was read from the vendor's own page on 2026-11-09; model lineups change, so re-check the
sources before relying on a name.*

## The rule

Spend by task, not by default:

- **Large**: complex code and client-facing text (recorder, film components, cuts, mix, narration, copy, the
  critic's review).
- **Medium**: mechanical, self-checking work (studio rebuilds, media encodes the scripts verify).
- **Small**: factual read-back ("what is on screen at 1:03?").
- **One independent large-model review** of the small models' work before anyone acts on it.

The lead session (the one that plans, briefs, rules and checks) runs on the most capable model the platform
offers: Claude Fable 5.1 (`fable`) on Claude Code [1][3], `gpt-6-astra` on Codex [4], Gemini 4 Argon on
Antigravity [8], Claude Fable 5.1 on Cursor [12], your main model on Hermes [14].

## The matrix

| Tier | Claude Code | Codex | Antigravity | Cursor | Hermes |
|---|---|---|---|---|---|
| Large | `opus` = Claude Opus 5.5 (`claude-opus-5-5`) [1][3] | `gpt-6.1-sol`, effort `high` [4][5] | Gemini 4 Argon, thinking High; subagent `model: pro` [8][9] | Claude Opus 5.5, or GPT-5.6 Sol [12] | any provider, e.g. Anthropic `claude-opus-5-5` [14][15] |
| Medium | `sonnet` = Claude Sonnet 5.5 (`claude-sonnet-5-5`) [1][3] | `gpt-6.1-terra`, effort `medium` [4][5] | Gemini 3.8 Flash, thinking Medium; subagent `model: flash` [8][9] | Claude Sonnet 5.5, or GPT-5.6 Terra [12] | a `model_map` route, e.g. `claude-sonnet-5-5` [15] |
| Small | `haiku` = Claude Haiku 5.5 (`claude-haiku-5-5`) [1][3] | `gpt-6-luna`, effort `high` [4] | Gemini 3.8 Flash, thinking Low; subagent `model: flash` [8][9] | Claude Haiku 5.5, or GPT-5.6 Luna [12] | a `model_map` route, e.g. `claude-haiku-5-5` [15] |

On Codex and Antigravity the reasoning effort is a real tier lever, not a detail: OpenAI's page tells you to
start Luna at High and Astra at Light [4], and Antigravity's subagent files can only name `pro` or `flash` [9],
so the medium and small tiers there differ by thinking level, not by model. The non-Claude cells are this kit's
choice from each vendor's own description of its models; they have not been benchmarked on the kit's tasks.

## Claude Code

- **Session**: `/model <alias|name>`, `claude --model <alias|name>`, `ANTHROPIC_MODEL`, or `"model"` in
  `settings.json` [3]. Effort: `/effort`, `--effort`, `CLAUDE_CODE_EFFORT_LEVEL`, or `effortLevel` [3].
- **Per sub-agent**: the `model:` frontmatter accepts `sonnet`, `opus`, `haiku`, `fable`, a full id such as
  `claude-opus-5-5`, or `inherit` [2]; an optional `effort:` takes `low`, `medium`, `high`, `xhigh`, `max` [2].
  Resolution order: the per-call `model` the lead passes, then the frontmatter, then
  `CLAUDE_CODE_SUBAGENT_MODEL`, then the session model [2].
- **The kit's `agents/*.md`**: the `model:` field uses the aliases (`opus`, `sonnet`, `haiku`), which on the
  Anthropic API resolve to Opus 5.5, Sonnet 5.5 and Haiku 5.5; on other providers they resolve to earlier
  versions [3]. The lead can override per spawn, as it does for `delivery-packager` in media mode.

## Codex (CLI, IDE extension, desktop app, cloud)

- **Session**: `/model` in the CLI (then **More reasoning…** for Max or Ultra), `codex -m <model>` or
  `codex exec -m <model> "..."`, or the model and reasoning control under the composer in the app [4].
- **Global**: `~/.codex/config.toml`: `model = "gpt-6.1-sol"` and `model_reasoning_effort = "high"`; levels are
  `low`, `medium`, `high`, `xhigh`, `max`, `ultra`, depending on the model [5][7]. Profile files
  (`~/.codex/<name>.config.toml`) are selected with `--profile <name>` [7].
- **Per sub-agent**: one TOML file per agent in `.codex/agents/` or `~/.codex/agents/` with `name`,
  `description`, `developer_instructions`, and optionally `model` and `model_reasoning_effort`, which override
  the parent [6]. Defaults for every spawned agent: `agents.default_subagent_model` and
  `agents.default_subagent_reasoning_effort` in `config.toml` [5].
- **The kit's agents**: not installed as Codex agents; the user runs the role's checklist with the tier's model,
  or writes a TOML agent per role with the matrix values.
- GPT-6.1 Terra needs Codex CLI 0.159.0 or later and is not listed for the IDE extension [4]. GPT-5.5 left Codex
  for ChatGPT sign-in on 2026-10-14 [4].

## Antigravity (app, CLI `agy`, IDE extensions)

- **Session**: the model selector under the prompt box, with a thinking level `Low`, `Medium` or `High` [8].
  CLI: `/model` (persists), `/model <model> <prompt>` for one prompt, `agy --model="Gemini 3.8 Flash"`,
  `/effort <level>` or `--effort` (`low` through `max`, depending on the model) [10]. The choice is saved as
  `model` in `settings.json` [10][18].
- **Offered** (by plan): Gemini 4 Argon, Gemini 3.8 / 3.7 / 3.6 Flash, Gemini 3.1 Pro, Claude Sonnet 5.5 and
  Opus 5.5 (thinking); Claude 4.6 and GPT-OSS-120b leave on 2026-11-18 [8]. Gemini 4 Argon is not on Free or
  Google AI Plus [8]. Google calls Gemini 4 Argon its flagship and Gemini 3.8 Flash its most intelligent Flash
  model [11].
- **Per sub-agent**: `.agents/agents/<name>.md` (or `~/.gemini/config/agents/`) with frontmatter
  `model: inherit | flash | pro` [9]. A tier, not a model id.
- **The kit's agents**: not installed as Antigravity agents; the user picks the model and thinking level when
  running the role's checklist, or writes a subagent file per role with `model: pro` or `model: flash`.

## Cursor (editor, CLI, cloud agents)

- **Session**: the model picker, including Auto (Cost, Balance, Intelligence) [12]. Third-party models
  (Claude, GPT, Gemini) need Premium or above; Plus has Cursor's own models only (Grok 4.7/4.6/4.5,
  Composer 2.5) at fixed settings [12]. Max Mode exists only on legacy request-based plans [12].
- **Per sub-agent**: `.cursor/agents/<name>.md` (also read from `.claude/agents/` and `.codex/agents/`) with
  `model: inherit` or a model id, plus bracketed options: `claude-opus-5[effort=high]`,
  `composer-2.5[fast=false]` [13]. The picker applies to the parent; a subagent runs its own model [13].
  Cursor falls back to another model when an admin blocks it or the plan lacks it [13].
- **The kit's agents**: Cursor reads `.claude/agents/`, but its `model:` field documents only `inherit` or a
  model id [13]; see UNVERIFIED.
- Cursor lists GPT-5.6 Sol, Terra and Luna, not the GPT-6 models Codex offers [12].

## Hermes Agent (Nous Research)

- **Model-agnostic**: Nous Portal, OpenRouter, OpenAI, your own endpoint and others [16].
- **Session**: `hermes model` (interactive picker), `/model [provider:model]` in chat,
  `hermes chat --model <model>`, `hermes config set model <model>` [14][16]. In `~/.hermes/config.yaml`:
  `model.default`, `model.provider`, `model.base_url` [14]; reasoning: `agent.reasoning_effort` [14].
- **Per sub-agent**: `delegation.provider` and `delegation.model` route every `delegate_task` child; empty
  means inherit the parent [14]. For a tier per task, `delegation.backend: model_map` with
  `delegation.backends.model_map.options` (each a `name`, `description`, `provider`, `model`, optional
  `reasoning_effort`); the parent picks an option per task [15]. `model_map` comes from the official
  advanced-delegation plugin [15]. Desktop: **Settings → Model → Subagents** [16].
- **The kit's agents**: not installed as Hermes agents; define `large`, `medium` and `small` options in
  `model_map` with the matrix models and the role names in their descriptions.
- Nous's own models (Hermes-4-14B, 2025-08-30; Hermes-4.3-36B, 2025-11-17) are open-weight [17]; this kit does
  not map them to a tier.

## Role → tier

| Role (`agents/`) | Tier | Note |
|---|---|---|
| lead (`walkthrough-film`) | top | plans, briefs, rules, checks |
| `take-operator` | large | recorder, capture test, takes, retakes |
| `film-editor` | large | components, storyboard, cuts, renders |
| `film-critic` | large | the independent review; verifies the describers |
| `app-fixer` | large | fixes what the film exposed, verifies on camera |
| `sound-designer` | large | bed, effects, mix, `delivered:` |
| `voiceover-producer` | large | narration script and placement |
| `delivery-packager` | large for copy, medium for media | the lead picks per spawn |
| `studio-builder` | medium | studio instance, re-sync, rebuild |
| `frame-describer` | small | factual frame read-back, 3 in parallel |

## UNVERIFIED

- Antigravity: which concrete model the subagent tiers `pro` and `flash` resolve to [9].
- Cursor: the exact id strings for the Claude 5.5 models in a subagent `model:` (the docs show `claude-opus-5`,
  `gpt-5.6-sol`, `composer-2`), and whether the kit's `opus` / `sonnet` / `haiku` aliases are accepted [13].
- Codex: the `[profiles.<name>]` table form inside `config.toml`; only profile files were documented [7].
- Hermes: that the Anthropic provider accepts the `claude-*-5-5` ids (its examples show `claude-opus-5` and
  `anthropic/claude-opus-4`) [14][15]; the full value set of `agent.reasoning_effort`; the install command for
  the advanced-delegation plugin.
- Every non-Claude tier choice: judged from vendor descriptions, not measured on this kit's films.

## Sources (all read 2026-11-09)

1. Anthropic, Models overview: https://platform.claude.com/docs/en/about-claude/models/overview
2. Claude Code, Subagents: https://code.claude.com/docs/en/sub-agents
3. Claude Code, Model configuration: https://code.claude.com/docs/en/model-config
4. OpenAI, Models (Codex): https://learn.chatgpt.com/docs/models (from https://developers.openai.com/codex/models)
5. OpenAI, Codex configuration reference: https://learn.chatgpt.com/docs/config-file/config-reference
6. OpenAI, Codex subagents: https://learn.chatgpt.com/docs/agent-configuration/subagents
7. OpenAI, Codex basic configuration: https://learn.chatgpt.com/docs/config-file/config-basic
8. Google Antigravity, Choose a model: https://antigravity.google/docs/models
9. Google Antigravity, Custom subagents: https://antigravity.google/docs/subagents
10. Google Antigravity, CLI reference: https://antigravity.google/docs/cli/reference
11. Google, Gemini models: https://aistudio.google.com/docs/models (from https://ai.google.dev/gemini-api/docs/models)
12. Cursor, Models & Pricing: https://cursor.com/docs/models-and-pricing
13. Cursor, Subagents: https://cursor.com/docs/subagents
14. Hermes Agent, Configuration: https://hermes-agent.nousresearch.com/docs/user-guide/configuration
15. Hermes Agent, Subagent delegation: https://hermes-agent.nousresearch.com/docs/user-guide/features/delegation
16. Hermes Agent README: https://github.com/NousResearch/hermes-agent
17. Nous Research on Hugging Face: https://huggingface.co/NousResearch
18. Google Antigravity, Settings: https://antigravity.google/docs/settings
