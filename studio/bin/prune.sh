#!/bin/bash
# prune.sh [--keep N] [--dry] [--protect NAME ...]: remove older checkpoints. Keeps the newest N
# (default 1), the current one (the last restored, $STUDIO_RUN/current-checkpoint) and every
# --protect name (`walkthrough studio prune` passes the checkpoints state.json names). --dry lists
# what would go. Checkpoints are APFS clones: Finder shows each at its full (logical) size, but they
# share blocks with the data and with each other, so a removed one frees only what it does not
# share (`walkthrough clean --dry` measures that). They are disposable once the film is accepted.
set -euo pipefail
case "${1:-}" in -h|--help) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;; esac
source "$(dirname "$0")/lib.sh"
keep=1; dry=0; protect=()
while [ $# -gt 0 ]; do
  case "$1" in
    --keep) keep="${2:?--keep needs a number}"; shift 2 ;;
    --keep=*) keep="${1#--keep=}"; shift ;;
    --dry) dry=1; shift ;;
    --protect) protect+=("${2:?--protect needs a name}"); shift 2 ;;
    *) die "unknown argument '$1' (usage: prune.sh [--keep N] [--dry] [--protect NAME ...])" ;;
  esac
done
echo "checkpoints in $STUDIO_CHECKPOINTS:"
prune_checkpoints "$keep" "$dry" "${protect[@]:-}"
