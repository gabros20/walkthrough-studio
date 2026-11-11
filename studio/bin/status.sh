#!/bin/bash
# status.sh: each service's pid, port owner and health, and the checkpoints on disk.
set -uo pipefail
source "$(dirname "$0")/lib.sh"
for svc in "${STUDIO_SERVICES[@]}"; do
  pid="$(pidof_svc "$svc")"; port="$(svar "$svc" port)"; owner=""; [ -n "$port" ] && owner="$(port_owner "$port")"
  state="down"; alive "$pid" && state="running"
  health="-"; alive "$pid" && { healthy "$svc" && health="healthy" || health="not answering"; }
  note=""; [ -n "$owner" ] && ! ours "$pid" "$owner" && note="  (port held by pid $owner, not ours)"
  printf '%-8s %-8s pid %-7s port %-6s %s%s\n' "$svc" "$state" "${pid:--}" "${port:--}" "$health" "$note"
done
cur="$(current_checkpoint)"
echo "checkpoints in $STUDIO_CHECKPOINTS (newest first; last restored: ${cur:-none}):"
checkpoints_newest_first | sed 's/^/  /' || true
