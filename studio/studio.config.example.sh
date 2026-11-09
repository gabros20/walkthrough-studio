# Studio config: a sandboxed copy of your app for recording takes. Copy this file next to your
# walkthrough.config.mjs, fill it in, and point the scripts at it:
#   STUDIO_CONFIG=path/to/studio.config.sh studio/bin/up.sh
#
# The file is sourced twice by studio/bin/lib.sh (so later lines can use STUDIO_TREE etc. even if
# you do not set them): only assign variables, export environment, and define functions here.

# ---- where things live --------------------------------------------------------------------------
# Everything the studio writes lives under STUDIO_ROOT: the tree copy, data, run/ (pids, logs),
# checkpoints/, and usually the takes. Keep it OUTSIDE your repo.
STUDIO_ROOT="$HOME/studios/my-app-studio"
# Your working repo. Only tree.sh reads it (to make the copy); nothing writes to it.
STUDIO_SOURCE="$HOME/code/my-app"
# Defaults (uncomment to change):
# STUDIO_TREE="$STUDIO_ROOT/tree"
# STUDIO_RUN="$STUDIO_ROOT/run"
# STUDIO_CHECKPOINTS="$STUDIO_ROOT/checkpoints"

# ---- data: copied into every checkpoint, replaced on restore ----------------------------------
# name:path pairs. Every path must be under STUDIO_ROOT (the scripts refuse anything else, so your
# own dev database can never be checkpointed over or restored into).
STUDIO_DATA=(
  "db:$STUDIO_ROOT/data/db"
  "uploads:$STUDIO_ROOT/data/uploads"
)

# ---- services, in start order (stopped in reverse) ----------------------------------------------
STUDIO_SERVICES=( api web )

# ---- tree.sh ------------------------------------------------------------------------------------
# Removed from the copy after cloning (default: .git, so nothing in the studio can commit or push).
STUDIO_TREE_REMOVE=( .git )
# Run by `tree.sh --build` inside the tree. Use a production build: dev servers draw badges,
# error overlays and hot-reload indicators into the footage.
STUDIO_BUILD='npm run build'

API_PORT=4011
WEB_PORT=4010

# ---- environment for every service --------------------------------------------------------------
# Point the app at the studio's data, never at yours. Values exported here win over a .env file in
# the tree for loaders that do not override existing variables (node --env-file, dotenv default).
export DATABASE_URL="file:$STUDIO_ROOT/data/db/app.sqlite"
export UPLOAD_DIR="$STUDIO_ROOT/data/uploads"
export APP_URL="http://localhost:$WEB_PORT"
# Nothing leaves the sandbox: telemetry, analytics and tracing off. Blank any token or endpoint
# variable your app reads (names only here; never put secret values in this file).
export DO_NOT_TRACK=1 NEXT_TELEMETRY_DISABLED=1
export OTEL_EXPORTER_OTLP_ENDPOINT="" OTEL_EXPORTER_OTLP_HEADERS=""
# export ANALYTICS_KEY=""   SENTRY_DSN=""

# ---- one block per service: <name>_<key> ---------------------------------------------------------
# <name>_cmd         required. Run with `exec` in <name>_dir after <name>_env is exported.
#                    Single-quote it to expand variables at start time.
# <name>_dir         working directory (default: $STUDIO_TREE)
# <name>_env         extra exports for this service only, as KEY=value words
# <name>_port        refuse to start if anything else listens here; also shown by status.sh
# <name>_health      URL that must answer 2xx/3xx before the service counts as up (default: pid alive)
# <name>_wait        seconds to wait for health (default 90)
# <name>_holds_data  1 (default) = stopped during checkpoint and restore; 0 = stateless, keeps running
# <name>_prepare     name of a function to run before each start (copy assets, check the build)

api_dir="$STUDIO_TREE/server"
api_cmd='node dist/server.js'
api_env="PORT=$API_PORT NODE_ENV=production"
api_port=$API_PORT
api_health="http://localhost:$API_PORT/health"
api_wait=120
api_holds_data=1

web_dir="$STUDIO_TREE/web"
web_cmd='npx next start -p "$WEB_PORT"'
web_env="NODE_ENV=production API_URL=http://localhost:$API_PORT"
web_port=$WEB_PORT
web_health="http://localhost:$WEB_PORT/"
web_wait=90
web_holds_data=0
web_prepare=check_web_build

check_web_build() {
  [ -d "$STUDIO_TREE/web/.next" ] || { echo "no production build in the tree; run studio/bin/tree.sh --build" >&2; return 1; }
}
