# Shared helpers for the studio scripts. Sourced, never run.
#
# Loads the studio config ($STUDIO_CONFIG, else ./studio.config.sh), fills defaults and checks the
# safety rules. Safety properties every script keeps:
#   - only ever signals pids this stack started (pid files in $STUDIO_RUN) and their children;
#   - refuses to start a service whose port is held by a process this stack did not start;
#   - data directories must live under $STUDIO_ROOT, never in the developer's repo or home data;
#   - checkpoint and restore stop the services that hold the data first.
# Works with macOS /bin/bash 3.2 (no associative arrays, no mapfile).

STUDIO_BIN="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "studio: $*" >&2; exit 1; }

load_config() {
  local cfg="${STUDIO_CONFIG:-}"
  if [ -z "$cfg" ]; then
    [ -f ./studio.config.sh ] && cfg="./studio.config.sh" || die "no config: set STUDIO_CONFIG or run next to studio.config.sh"
  fi
  [ -f "$cfg" ] || die "config not found: $cfg"
  STUDIO_CONFIG="$(cd "$(dirname "$cfg")" && pwd)/$(basename "$cfg")"
  export STUDIO_CONFIG
  # The config is sourced twice: the first pass (unset variables allowed) finds STUDIO_ROOT and any
  # explicit STUDIO_TREE / STUDIO_RUN / STUDIO_CHECKPOINTS, the defaults are filled in, and the
  # second pass lets every other line use them. So the config must only assign variables and
  # define functions.
  # shellcheck disable=SC1090
  set +u; source "$STUDIO_CONFIG"; set -u
  [ -n "${STUDIO_ROOT:-}" ] || die "STUDIO_ROOT is not set in $STUDIO_CONFIG"
  STUDIO_ROOT="${STUDIO_ROOT%/}"
  : "${STUDIO_TREE:=$STUDIO_ROOT/tree}"
  : "${STUDIO_RUN:=$STUDIO_ROOT/run}"
  : "${STUDIO_CHECKPOINTS:=$STUDIO_ROOT/checkpoints}"
  export STUDIO_ROOT STUDIO_TREE STUDIO_RUN STUDIO_CHECKPOINTS
  # shellcheck disable=SC1090
  source "$STUDIO_CONFIG"
  [ -n "${STUDIO_SERVICES+x}" ] && [ "${#STUDIO_SERVICES[@]}" -gt 0 ] || die "STUDIO_SERVICES is empty"
  local svc entry path
  for svc in "${STUDIO_SERVICES[@]}"; do
    [[ "$svc" =~ ^[a-z][a-z0-9_]*$ ]] || die "service name '$svc': use lower-case letters, digits and _"
    [ -n "$(svar "$svc" cmd)" ] || die "${svc}_cmd is not set"
  done
  for entry in "${STUDIO_DATA[@]:-}"; do
    [ -n "$entry" ] || continue
    path="${entry#*:}"
    [[ "${entry%%:*}" =~ ^[A-Za-z0-9_.-]+$ ]] || die "STUDIO_DATA entry '$entry': use name:/abs/path"
    case "$path" in "$STUDIO_ROOT"/*) ;; *) die "data dir $path is outside STUDIO_ROOT ($STUDIO_ROOT); refusing" ;; esac
    if [ -n "${STUDIO_SOURCE:-}" ]; then
      case "$path" in "${STUDIO_SOURCE%/}"/*) die "data dir $path is inside the developer's repo; refusing" ;; esac
    fi
  done
  mkdir -p "$STUDIO_RUN" "$STUDIO_CHECKPOINTS"
}

# svar <service> <key> [default]: value of ${service}_${key}
svar() { local n="${1}_${2}"; local v="${!n:-}"; [ -n "$v" ] && echo "$v" || echo "${3:-}"; }

alive() { [ -n "${1:-}" ] && kill -0 "$1" 2>/dev/null; }
pidof_svc() { [ -f "$STUDIO_RUN/$1.pid" ] && cat "$STUDIO_RUN/$1.pid" || true; }

descendants() { # recursive children of pid $1
  local c; for c in $(pgrep -P "$1" 2>/dev/null); do echo "$c"; descendants "$c"; done
}

port_owner() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1 || true; }

# True when pid $2 is $1 or one of its descendants (the port is held by our own process tree).
ours() { local root="$1" p="$2"; [ -n "$root" ] && { [ "$root" = "$p" ] || descendants "$root" | grep -qx "$p"; }; }

healthy() { # service
  local url; url="$(svar "$1" health)"
  if [ -n "$url" ]; then curl -fsS -o /dev/null --max-time 5 "$url" 2>/dev/null; else alive "$(pidof_svc "$1")"; fi
}

wait_healthy() { # service secs
  local i; for i in $(seq 1 "$2"); do
    healthy "$1" && return 0
    alive "$(pidof_svc "$1")" || return 1
    sleep 1
  done; return 1
}

stop_svc() { # service: TERM, wait up to 20 s, then KILL; only our pid and its children
  local pid; pid="$(pidof_svc "$1")"
  if alive "$pid"; then
    local kids; kids="$(descendants "$pid")"
    kill -TERM $pid $kids 2>/dev/null || true
    local i; for i in $(seq 1 100); do alive "$pid" || break; sleep 0.2; done
    local p; for p in $pid $kids; do alive "$p" && kill -KILL "$p" 2>/dev/null || true; done
  fi
  /bin/rm -f "$STUDIO_RUN/$1.pid"
}

start_svc() { # service
  local svc="$1" pid port owner dir cmd envs prep wait
  pid="$(pidof_svc "$svc")"
  if alive "$pid" && healthy "$svc"; then return 0; fi
  stop_svc "$svc"
  port="$(svar "$svc" port)"
  if [ -n "$port" ]; then
    owner="$(port_owner "$port")"
    [ -z "$owner" ] || { echo "port $port ($svc) is held by pid $owner, which this stack did not start; refusing" >&2; return 1; }
  fi
  prep="$(svar "$svc" prepare)"
  if [ -n "$prep" ]; then "$prep" || { echo "$svc: prepare step $prep failed" >&2; return 1; }; fi
  dir="$(svar "$svc" dir "$STUDIO_TREE")"
  cmd="$(svar "$svc" cmd)"
  envs="$(svar "$svc" env)"
  [ -d "$dir" ] || { echo "$svc: directory $dir does not exist" >&2; return 1; }
  ( cd "$dir" || exit 1
    [ -n "$envs" ] && eval "export $envs"
    eval "exec nohup $cmd" >>"$STUDIO_RUN/$svc.log" 2>&1 </dev/null ) &
  echo $! >"$STUDIO_RUN/$svc.pid"
  wait="$(svar "$svc" wait 90)"
  wait_healthy "$svc" "$wait" || { echo "$svc did not become healthy in ${wait}s; see $STUDIO_RUN/$svc.log" >&2; return 1; }
}

holds_data() { [ "$(svar "$1" holds_data 1)" = "1" ]; }

# Reverse order of STUDIO_SERVICES (stop order).
services_reversed() { local i; for ((i=${#STUDIO_SERVICES[@]}-1; i>=0; i--)); do echo "${STUDIO_SERVICES[$i]}"; done; }

# clone_dir <src> <dst>: APFS clone (cp -c: instant, no extra space until files change), else a
# reflink copy (GNU cp on btrfs/xfs), else a plain copy. Prints which one it used.
clone_dir() {
  [ -e "$2" ] && { echo "clone target exists: $2" >&2; return 1; }
  if cp -cR "$1" "$2" 2>/dev/null; then echo "apfs-clone"; return 0; fi
  /bin/rm -rf "$2"
  if cp -R --reflink=auto "$1" "$2" 2>/dev/null; then echo "reflink-or-copy"; return 0; fi
  /bin/rm -rf "$2"
  cp -R "$1" "$2" && echo "copy"
}

valid_name() { [[ "$1" =~ ^[A-Za-z0-9_-]+$ ]] || die "bad checkpoint name '$1' (letters, digits, - and _)"; }

load_config
