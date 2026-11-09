#!/bin/bash
# checkpoint.sh <name>: stop the services that hold data, clone every STUDIO_DATA dir into
# $STUDIO_CHECKPOINTS/<name>/<data-name>/, then start those services again if they were running.
# The take runner also saves the browser's storage.json and its ctx.json next to the data.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
name="${1:?usage: checkpoint.sh <name>}"
valid_name "$name"
[ -n "${STUDIO_DATA+x}" ] && [ "${#STUDIO_DATA[@]}" -gt 0 ] || die "STUDIO_DATA is empty: nothing to checkpoint"
dest="$STUDIO_CHECKPOINTS/$name"
tmp="$STUDIO_CHECKPOINTS/.$name.tmp"
/bin/rm -rf "$tmp"; mkdir -p "$tmp"
was_up=()
for svc in $(services_reversed); do
  if holds_data "$svc"; then
    if alive "$(pidof_svc "$svc")"; then was_up+=("$svc"); fi
    stop_svc "$svc"
  fi
done
for entry in "${STUDIO_DATA[@]}"; do
  dname="${entry%%:*}"; src="${entry#*:}"
  [ -d "$src" ] || die "data dir $src does not exist"
  how="$(clone_dir "$src" "$tmp/$dname")"
  echo "  $dname: $how"
done
# An older checkpoint of the same name is replaced as a whole (the runner writes storage.json and
# ctx.json into the new one right after this script).
/bin/rm -rf "$dest"; mv "$tmp" "$dest"
for svc in "${STUDIO_SERVICES[@]}"; do
  for up in "${was_up[@]:-}"; do
    if [ "$up" = "$svc" ]; then start_svc "$svc"; fi
  done
done
echo "checkpoint $name saved ($dest)"
