# studio

A sandboxed instance of the app for recording: its own copy of the code, its own data, its own ports, and checkpoints of the data so any take can be re-shot from the same state. The developer's repo, dev servers and data are never touched.

```
<STUDIO_ROOT>/                 outside the repo
  tree/                        copy of the developer's repo (APFS clone), production build
  data/<name>/                 the app's data (database, caches, uploads): STUDIO_DATA
  checkpoints/<CP>/<name>/     clones of every data dir, plus storage.json and ctx.json from the take runner
  run/<service>.pid|.log       pids and logs of the services this stack started; listeners.before
  takes/                       usually the takes (set takesDir in walkthrough.config.mjs)
```

## Scripts

All scripts read the config from `$STUDIO_CONFIG` (else `./studio.config.sh`). Start from [`studio.config.example.sh`](studio.config.example.sh); the worked example is [`../examples/brightpost/studio.config.sh`](../examples/brightpost/studio.config.sh).

| Script | Does |
|---|---|
| `bin/tree.sh [--build]` | makes `$STUDIO_TREE` a fresh copy of `$STUDIO_SOURCE`, removes `STUDIO_TREE_REMOVE` (default `.git`), then optionally runs `STUDIO_BUILD` in it. Refuses while a service is running. |
| `bin/up.sh` | starts every service in order and waits for its health URL. Safe to repeat. |
| `bin/down.sh` | stops this stack's services (reverse order). Safe to repeat. |
| `bin/checkpoint.sh <CP> [--keep N] [--protect CP ...]` | stops the services that hold data, clones every data dir into `checkpoints/<CP>/`, restarts the ones that were running. `--keep N` then prunes older checkpoints to the newest N (this one included). |
| `bin/restore.sh <CP>` | stops the services that hold data, replaces every data dir with a clone of the checkpoint, brings the whole stack up, and notes `<CP>` in `run/current-checkpoint`. The checkpoint stays untouched, so it can be restored again. |
| `bin/prune.sh [--keep N] [--dry] [--protect CP ...]` | removes every checkpoint but the newest N (default 1), the last restored one (`run/current-checkpoint`) and the `--protect` names; `--dry` lists what would go. |
| `bin/status.sh` | each service's pid, port owner and health; the checkpoints on disk, newest first, and the last restored one. |
| `bin/paths.sh` | resolved paths as `KEY=value` lines (the take runner reads `STUDIO_CHECKPOINTS` from it). |

The take runner (`recorder/takes/run.mjs`) calls `checkpoint.sh` and `restore.sh` itself when its config has a `studio` section, and saves the browser's `storage.json` and its `ctx.json` into the checkpoint.

## Safety properties

- **Only our own processes.** Each service's pid goes to `run/<service>.pid`. Stopping sends TERM (then KILL after 20 s) to that pid and its descendants only. Nothing is ever killed by name or by port.
- **Refuse a port held by someone else.** Before a start, if anything listens on `<service>_port`, the script refuses instead of killing it. Your dev servers keep running on their own ports; the studio uses different ones.
- **Data stays in the studio.** Every `STUDIO_DATA` path must be under `STUDIO_ROOT` and outside `STUDIO_SOURCE`; the scripts refuse otherwise. The config exports the app's data locations (database URL, cache dirs) pointing at those copies, and blanks anything that could reach an external service (telemetry, tracing exporters, analytics keys).
- **Restore stops first.** Data is never replaced under a running service; checkpoints are taken with the holders stopped, so a database is never copied mid-write.
- **The source repo is read-only.** Only `tree.sh` reads it; the new tree is built beside the old one and swapped in when complete.

## The APFS clone trick

On APFS (macOS), `cp -c` makes a clone: a new file that shares the original's blocks until either side changes. Cloning a whole working tree, `node_modules` included, takes seconds and almost no disk space, and the copy runs exactly the code (and dependencies) you have checked out, with no install step. Checkpoints work the same way: a checkpoint of a 2 GB database costs nothing until the database changes, and a restore is a clone back.

`clone_dir` in `bin/lib.sh` tries, in order: `cp -cR` (APFS clone), `cp -R --reflink=auto` (GNU cp: reflink on btrfs/xfs, copy elsewhere), plain `cp -R`. Each script prints which one it used. On a non-APFS volume everything still works, only slower and using real disk space.

### How big is a checkpoint?

Finder, `ls` and `du` count every clone at its full size: ten checkpoints of a 0.9 GB database show as 9 GB
of "logical" size. On disk a clone costs only the blocks that changed since it was made (in the data, or in
another checkpoint it shares with), so the same ten checkpoints may take 1 GB. Removing one frees only its
own changed blocks, and blocks it still shares with the live data or a kept checkpoint stay. `walkthrough
clean --dry` shows both sizes for every checkpoint (it reads each file's APFS private size and clone group),
and `walkthrough studio prune` prints the free space before and after.

Checkpoints are disposable once the film is accepted: keep the newest one (and the current one) while you
might still re-shoot, `walkthrough studio prune --keep 1` (or `walkthrough studio checkpoint <CP> --keep 1`
as you go) to drop the rest, and `walkthrough clean --all` after delivery removes them all. Never prune while
a take runner may still `restore` an older checkpoint (a `redo` of an earlier scene needs the checkpoint
before it).

Caveats:
- Symlinks are copied as symlinks. Relative links inside the tree (pnpm's `node_modules`) keep working; absolute links still point at the source repo.
- `.env` files come along with the clone. Keep them if the app needs them (the config's exported variables override them for most loaders) or add them to `STUDIO_TREE_REMOVE` and set everything in the config.
- A clone shares blocks, not files: changing the source repo later does not change the tree. Run `tree.sh` again to pick up new code.

## The production build step

Record against a production build, not the dev server. Dev servers draw things into the page that end up in the footage: framework dev badges and route indicators, error overlays, hot-reload toasts, unminified slow paths. `tree.sh --build` runs `STUDIO_BUILD` inside the tree after the copy (the worked example builds the Next.js app with `output: "standalone"` and serves it with `NODE_ENV=production`; a `<service>_prepare` function copies `public/` and `.next/static` into the standalone folder, which Next leaves out). The build log is `run/build.log`.

## Typical session

```
export STUDIO_CONFIG=path/to/studio.config.sh
studio/bin/tree.sh --build             # fresh copy of the repo, production build
# seed the studio data (your app's own seed or provisioning step, pointed at the studio env)
studio/bin/up.sh
studio/bin/checkpoint.sh CP0           # the clean starting state
node recorder/takes/run.mjs --config path/to/walkthrough.config.mjs
#   ... go files: {"action":"next","checkpoint":"CP1"} / {"action":"redo","restore":"CP0"} ...
studio/bin/down.sh
studio/bin/prune.sh --keep 1           # once the takes are accepted: drop the older checkpoints
```

Seeding is app-specific and not part of these scripts. Anything secret it produces (one-time sign-in links, API keys) stays in the studio folder, outside git.
