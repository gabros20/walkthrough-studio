#!/bin/bash
# restore.sh <name>: stop the services that hold data, replace every STUDIO_DATA dir with a clone
# of $STUDIO_CHECKPOINTS/<name>/<data-name>/, then bring the whole stack up. The checkpoint itself
# is never modified, so the same checkpoint can be restored again and again.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
name="${1:?usage: restore.sh <name>}"
valid_name "$name"
[ -n "${STUDIO_DATA+x}" ] && [ "${#STUDIO_DATA[@]}" -gt 0 ] || die "STUDIO_DATA is empty: nothing to restore"
src="$STUDIO_CHECKPOINTS/$name"
for entry in "${STUDIO_DATA[@]}"; do
  [ -d "$src/${entry%%:*}" ] || die "checkpoint $name has no ${entry%%:*}/ ($src)"
done
for svc in $(services_reversed); do
  if holds_data "$svc"; then stop_svc "$svc"; fi
done
for entry in "${STUDIO_DATA[@]}"; do
  dname="${entry%%:*}"; dst="${entry#*:}"
  /bin/rm -rf "$dst"
  mkdir -p "$(dirname "$dst")"
  how="$(clone_dir "$src/$dname" "$dst")"
  echo "  $dname: $how"
done
echo "$name" >"$STUDIO_RUN/current-checkpoint"   # prune.sh never removes it
for svc in "${STUDIO_SERVICES[@]}"; do start_svc "$svc"; done
echo "restored $name; stack is up"
