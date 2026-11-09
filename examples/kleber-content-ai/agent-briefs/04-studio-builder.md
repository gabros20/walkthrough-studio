# 04 studio-builder: Build studio app instance

- Spawned: 2026-11-06 11:04 UTC
- Agent name: `studio`; model: `sonnet`; type: `teammate`
- Follow-up messages from the lead: 1

## Brief

You are setting up an isolated "studio" copy of a web app so a product walkthrough video can be recorded against it without touching the developer's own running dev servers or data. Another agent is, in parallel, writing the screen recorder in `videos/walkthrough-v2/recorder/` of the repo; do not touch that folder.

## Where things are
- Repo: `~/Documents/Work/Projects/kleber-content-ai` (pnpm monorepo, Node 24; `apps/web` Next.js 16 with `output: "standalone"`, `apps/server` Hono core API, `packages/core`). Git tree is clean.
- The full plan is at `~/.claude/plans/okay-first-i-want-serialized-falcon.md`. Read its sections "Recording → Studio instance" and "Takes and checkpoints" first; they are your spec. Everything below adds to it.
- Your output folder: `~/Documents/Work/Projects/kleber-content-ai-studio/` (sibling of the repo; create it). The Mac has 36 GB free, so everything stays on the internal disk.

## Hard rules
- The developer's own servers are running on ports 3000, 3001 and 8787. Never stop, restart or reconfigure them, and never write into the repo's `data/` folder. They must still be listening when you finish.
- Do not change anything inside the repo (no edits to `apps/`, `packages/`, root config, lockfiles; no commits). If a workaround needs a code or config change, make it only in the cloned tree and list it in your report.
- Never print secret values (`.env` contents, tokens, keys). Names only. The one-time sign-in link you issue goes into a file, not into your report.
- No telemetry leaves the studio instance (`TELEMETRY=off`).

## What to build
1. `studio/tree/`: an APFS clone of the repo (`cp -cR`), then delete `tree/data`, `tree/videos`, `tree/.git` and `tree/apps/web/.next` from the clone. Check that pnpm's symlinked `node_modules` still resolve in the clone.
2. Database copy at `studio/data/pglite`. First read `packages/core/src/config.ts` and `packages/core/src/db/client.ts` to learn how the DB location is resolved; `.env` defines a `DATABASE_URL` and the code also knows `PGLITE_DIR`. Make certain the studio core uses the studio copy and can never open the developer's database. The dev server holds `data/pglite` open, so copy it twice and compare the copies; if they differ, copy again until two consecutive copies match, then confirm the copy opens.
3. Start scripts in `studio/bin/`: `up.sh` (start core on `:8797` and web on `:3011`, wait until both answer, write pid files and logs under `studio/run/`), `down.sh`, `checkpoint.sh <name>` (stop core, clone `data/pglite` and the render cache to `studio/checkpoints/<name>/`, start core again) and `restore.sh <name>`. They must be safe to run repeatedly and must only ever kill the pids they started.
   - Core: `pnpm --filter @kleber/server start` (not watch mode) from the clone, with `PORT=8797`, `PGLITE_DIR` and `RENDER_CACHE_DIR` under `studio/`, `WEB_BASE_URL=http://localhost:3011`, `PUBLIC_BASE_URL=http://localhost:8797`, `JOB_LOOP_MS=86400000`, `TELEMETRY=off`. Check how the server loads `.env` and that your process env wins over it.
   - Web: a production build made inside the clone, started as the standalone server (`node apps/web/server.js` from `.next/standalone` after copying `public` and `.next/static` into it, with `node --env-file=<clone>/.env`, `NODE_ENV=production PORT=3011 HOSTNAME=localhost`, `CORE_API_URL=http://localhost:8797`). Find every env var the web app uses to reach the core or build its own URLs and point each at the studio ports. If the production build cannot be made to work after a serious attempt, fall back to `next dev --port 3011` from the clone with the dev-only UI suppressed in the clone (Next dev indicator off in the clone's config; note which dev-only UI remains) and say so clearly.
   - `RATING_PARTNERS` set so the internal "Rate renders" settings section is hidden for the demo dealer, and `USAGE_PARTNER_LIMITS` raised for `p_summit_tyre` so repeated rehearsals cannot lock the composer. Read the code to get the exact formats.
4. Demo dealer, created with the core stopped (PGlite is single-process): `packages/core/src/scripts/dealer-login.ts provision --id p_summit_tyre --name "Summit Tyre Centre" --market INT --language en --channels instagram_feed,facebook`, then `issue --partner p_summit_tyre --email sam@summit-tyre.example --name "Sam Carter" --role owner`. Read the script first for exact flags. Save the printed one-time link to `studio/link.txt`. The link origin must be `http://localhost:3011`.
5. Checkpoint `CP0` taken right after issuing the link (restoring CP0 must make the link unused again).
6. A fictional dealer logo at `studio/assets/summit-logo.png` (and the `.svg` source): a simple, credible wordmark for "Summit Tyre Centre", e.g. a small mountain-peak mark with "SUMMIT" in a heavy sans and "TYRE CENTRE" spaced small beneath. One dark colour plus one accent that is not Kleber's red (the app composes it next to the Kleber logo). Transparent background, about 1200 px wide, tight crop. First read the app's logo upload code for accepted formats, size limits and how it derives the dark/light versions, and make the file suit that. Render SVG to PNG with a tool already on the machine (`sharp` or `@resvg/resvg-js` from the repo's node_modules, or `rsvg-convert`).

## Check before you report
- `curl` shows the core on 8797 healthy and the web on 3011 serving the sign-in page; the HTML of the production page carries no Next dev indicator.
- Ports 3000, 3001, 8787 still listening with the same pids as when you started; `git status` in the repo is still clean.
- The studio core's log shows it opened the studio database path.
- `down.sh` then `up.sh` works; `restore.sh CP0` works and leaves the stack up.
- Do not use up the one-time link. An HTTP-level look at the enroll page is enough; the recorder will do the real sign-in.

## Report back (short, plain text)
What is running (ports, how to start/stop), the exact paths of scripts, link file, logo and checkpoints, the precise env var formats you used for limits and rating, whether the web is a production build or the dev fallback, every change made inside the clone, and anything you could not verify. State failures plainly; do not describe an unverified step as done.

## Follow-up messages from the lead

### 2026-11-06 14:00 UTC

Urgent, small job: bring the studio clone's web app up to date with the repo and rebuild it. The repo gained one commit since you cloned (9094d0a, a web fix). The only source differences are `apps/web/src/lib/agent-activity.ts` and `apps/web/test/agent-activity.test.ts`; `packages/`, `apps/server`, root `package.json` and the lockfile are identical (I diffed them).

Do this, fast:
1. Copy those two files from `~/Documents/Work/Projects/kleber-content-ai/apps/web/` into the same paths under `studio/tree/apps/web/`. Then re-run a recursive diff of `apps/` and `packages/` between repo and clone (ignoring node_modules, .next, dist, next-env.d.ts) and confirm nothing else differs; if the user has committed more in the meantime, copy that too and tell me what it was.
2. Stop only the studio web server (leave the core and the database exactly as they are; do not restore or checkpoint anything), rebuild the production web build in the clone the same way you did before, copy `public` and `.next/static` into the standalone folder, start the web again on :3011.
3. Check: sign-in page returns 200 on :3011, core still healthy on :8797, ports 3000/3001/8787 untouched.

Reply with one or two lines when the rebuilt web is up (or the exact error if the build fails). Another agent is waiting on this to start recording, so do not do anything beyond these steps.
