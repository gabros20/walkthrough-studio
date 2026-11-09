# ADR-008: Orchestrate by model tier (Opus, Sonnet, Haiku, with an Opus critic) under fixed honesty rules

## Status

Accepted

## Date

2026-11-06

## Context

A film job is long: planning, a studio, nine takes, several drafts, sound, voiceover and a package, spread
over days and many agent turns. Running every step on the strongest model is slow and expensive; running it
all on a small one produced wrong calls. On the first job the Haiku frame read-back over-reported (of about 12
flags, several were by design or misreads; lesson E6), long reports were cut off in transit (E7), a worker
spawned its own sub-agent and left half-done edits (A1), and messages crossed with an agent's work (A2).
The film is shown to clients, so what it claims has to be true.

## Decision

- The **main session** (the most capable model) only plans, briefs, rules and checks.
- **Opus** agents do complex code and client-facing text: `take-operator`, `film-editor`, `film-critic`,
  `app-fixer`, `sound-designer`, `voiceover-producer`, `delivery-packager` in copy mode.
- **Sonnet** does mechanical, self-checking work: `studio-builder`, `delivery-packager` in media mode.
- **Haiku** answers "what is on screen at 1:03?": `frame-describer`, three in parallel on disjoint ranges,
  facts only.
- An **Opus critic** rules on every describer flag (real / by design / misread) by extracting frames itself;
  nobody acts on an unverified flag. Critical reviews are never skipped.
- Agents are named and long-lived; the lead numbers its rulings and says what each supersedes; long reports
  go to a file; workers do not spawn sub-agents.
- **Honesty rules** bind every agent: agent waits are labelled time-lapses; nothing is mocked or redrawn; a
  caption or spoken line is cut when its claim is not visibly true in the take; fictional companies and
  generated media are disclosed; audio is "measured, not heard"; paid generations are made once, by the lead.

## Alternatives considered

### One strong model for everything

- Cons: the cost of reading hundreds of frames and doing mechanical encodes at the top tier, for no gain.
- Rejected.

### Small models review on their own

- Cons: E6: a cheap model grading its own reading over-reports and misreads.
- Rejected: describers describe, the critic judges.

### A single agent doing the whole job sequentially

- Cons: one context fills up with footage reports and code; no independent review.
- Rejected.

## Consequences

- The plan says which agent and model does each step ([`skills/walkthrough-film/SKILL.md`](../../skills/walkthrough-film/SKILL.md),
  [`docs/PIPELINE.md`](../PIPELINE.md), Model tiers); agent definitions carry their tier in `agents/*.md`.
- The lead spends tokens on rulings and final checks, and must brief each agent fully (goal, paths, hard
  rules, checks, report format); the roles and what each brief must cover are in `agents/*.md`.
- Some claims cannot be verified in-session (how the audio sounds, licence terms); they are handed to a human
  as open checks, never stated as done.
- Lessons E6, E7, A1, A2 in [`docs/LESSONS.md`](../LESSONS.md) are the evidence for these rules.
