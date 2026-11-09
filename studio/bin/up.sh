#!/bin/bash
# up.sh: start every service in STUDIO_SERVICES order and wait until each is healthy. Safe to repeat
# (a healthy service this stack started is left alone).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
# Who was listening before we started anything (for diagnosing port clashes later).
lsof -nP -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $2, $9}' | sort -u >"$STUDIO_RUN/listeners.before" || true
for svc in "${STUDIO_SERVICES[@]}"; do start_svc "$svc"; done
for svc in "${STUDIO_SERVICES[@]}"; do
  port="$(svar "$svc" port)"
  printf '%-8s pid %-7s %s\n' "$svc" "$(pidof_svc "$svc")" "${port:+http://localhost:$port}"
done
