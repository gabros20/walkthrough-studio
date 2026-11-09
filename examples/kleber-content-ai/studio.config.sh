# Studio config for the Kleber Content AI walkthrough. Read by studio/bin/*.sh:
#   STUDIO_CONFIG=examples/kleber-content-ai/studio.config.sh studio/bin/up.sh
# Assignments and functions only (the file is sourced twice; see studio/README.md).
#
# The app: a pnpm monorepo with a Node API server ("core", PGlite database, render cache on disk)
# and a Next.js web app ("web") built as a standalone production server.

STUDIO_ROOT="${KLEBER_STUDIO:-$HOME/Documents/Work/Projects/kleber-content-ai-studio}"
STUDIO_SOURCE="${KLEBER_SOURCE:-$HOME/Documents/Work/Projects/kleber-content-ai}"

# Copied into every checkpoint; replaced on restore. Both live under STUDIO_ROOT, never in the repo.
STUDIO_DATA=(
  "pglite:$STUDIO_ROOT/data/pglite"
  "render-cache:$STUDIO_ROOT/data/render-cache"
)
STUDIO_SERVICES=( core web )

# tree.sh: drop .git from the copy; keep .env (the web server reads it with --env-file, and every
# variable exported below wins over it).
STUDIO_TREE_REMOVE=( .git )
# tree.sh --build: production build of the web app, so no Next.js dev indicator is in the footage.
STUDIO_BUILD='pnpm --filter @kleber/web build'

CORE_PORT=8797
WEB_PORT=3011

# ---- environment for both services. Process env wins over tree/.env (node --env-file and
# process.loadEnvFile never override a variable that is already set).
# Database: PGlite only, always the studio copy. An empty DATABASE_URL blocks any Postgres URL in .env.
export DATABASE_URL=""
export PGLITE_DIR="$STUDIO_ROOT/data/pglite"
export RENDER_CACHE_DIR="$STUDIO_ROOT/data/render-cache"
export FRONTIFY_SNAPSHOT_DIR="$STUDIO_ROOT/data/frontify-raw"
export WEB_BASE_URL="http://localhost:$WEB_PORT"
export PUBLIC_BASE_URL="http://localhost:$CORE_PORT"
export JOB_LOOP_MS=86400000           # background jobs effectively off during takes
export CORE_API_URL="http://localhost:$CORE_PORT"
export APP_URL="http://localhost:$WEB_PORT"
# Demo dealer: rating page stays internal; usage limits lifted for rehearsals.
export RATING_PARTNERS="p_kleber_int"
export USAGE_PARTNER_LIMITS='{"p_summit_tyre":{"messages":0,"tokens":0,"reviews":0}}'
# Nothing leaves the studio instance: telemetry and tracing off, export endpoints blanked.
export TELEMETRY=off TELEMETRY_CONTENT=off TELEMETRY_TOKEN="" NEXT_TELEMETRY_DISABLED=1
export OTEL_EXPORTER_OTLP_ENDPOINT="" OTEL_EXPORTER_OTLP_TRACES_ENDPOINT="" OTEL_EXPORTER_OTLP_HEADERS=""

# ---- core: API server, holds the database and render cache
core_dir="$STUDIO_TREE"
core_cmd='pnpm --filter @kleber/server start'
core_env="PORT=$CORE_PORT"
core_port=$CORE_PORT
core_health="http://localhost:$CORE_PORT/health"
core_wait=120
core_holds_data=1

# ---- web: Next.js standalone production server (stateless)
web_dir="$STUDIO_TREE/apps/web/.next/standalone"
web_cmd='node --env-file="$STUDIO_TREE/.env" apps/web/server.js'
web_env="NODE_ENV=production PORT=$WEB_PORT HOSTNAME=localhost"
web_port=$WEB_PORT
web_health="http://localhost:$WEB_PORT/sign-in"
web_wait=90
web_holds_data=0
web_prepare=prepare_web

# Next's standalone output does not include public/ and .next/static; copy them in once per build.
prepare_web() {
  local sa="$STUDIO_TREE/apps/web/.next/standalone/apps/web"
  [ -f "$sa/server.js" ] || { echo "no standalone build in $sa (run tree.sh --build)" >&2; return 1; }
  [ -d "$sa/public" ] || cp -R "$STUDIO_TREE/apps/web/public" "$sa/public"
  [ -d "$sa/.next/static" ] || { mkdir -p "$sa/.next"; cp -R "$STUDIO_TREE/apps/web/.next/static" "$sa/.next/static"; }
}
