# ADR-004: Record an owned app in a sandboxed studio instance with APFS-clone checkpoints; redo bad takes, never patch them

## Status

Accepted

## Date

2026-11-06

## Context

The app under test was the owner's working tree, with uncommitted features, a dev server holding the database
open, and dev badges on screen. The story runs one campaign through every feature, so each take depends on
the state the previous one left. Some steps can only happen once (a one-time sign-in link is consumed on first
use), and agent turns in the app cost money and do not repeat exactly.

## Decision

Studio mode records against a **studio instance** (`studio/`): an APFS clone of the working tree (`cp -cR`,
near-zero space), its own copy of the data, separate ports, a production build, telemetry off. A checkpoint
stops the services that hold data and clones every data dir (plus the browser's `storage.json` and the
runner's `ctx.json`); a restore clones it back. The take runner checkpoints after takes whose state later
takes need. **A bad take is restored and redone, never patched** in the edit.

## Alternatives considered

### Record against the owner's dev server and data

- Cons: dev badges and overlays in the footage; takes change the owner's real data; the owner's edits restart
  the app mid-take.
- Rejected. `next dev` from the clone, with dev UI suppressed, was kept only as a fallback if the production
  build failed.

### Plain copies instead of clones

- Cons: a full copy of a monorepo with `node_modules`, and a copy per checkpoint, costs minutes and gigabytes.
- Kept as the automatic fallback on non-APFS volumes (`clone_dir` in `studio/bin/lib.sh`).

### Patch a bad moment in the edit

- Cons: a mocked or composited frame breaks the honesty rules, and the content would no longer match between
  scenes.
- Rejected.

## Consequences

- The owner's repo, dev servers and data are never touched; the scripts stop only the pids they started and
  refuse a port held by someone else ([`studio/README.md`](../../studio/README.md), Safety properties).
- Any take can be re-shot from the same state; restoring CP0 makes the one-time link unused again (lesson
  C13).
- Only one agent may own the stack at a time (lesson C4); others are told in writing not to restart it.
- The clone does not follow the source: re-sync and rebuild before every recording session (lesson C2).
- Seeding is app-specific and lives in the project, not in these scripts.
- Site mode has no studio and no checkpoints; its scenes must be idempotent or reset by hand.
