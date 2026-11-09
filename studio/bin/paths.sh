#!/bin/bash
# paths.sh: print the resolved studio paths as KEY=value lines (read by the take runner).
set -euo pipefail
source "$(dirname "$0")/lib.sh"
echo "STUDIO_CONFIG=$STUDIO_CONFIG"
echo "STUDIO_ROOT=$STUDIO_ROOT"
echo "STUDIO_TREE=$STUDIO_TREE"
echo "STUDIO_RUN=$STUDIO_RUN"
echo "STUDIO_CHECKPOINTS=$STUDIO_CHECKPOINTS"
for entry in "${STUDIO_DATA[@]:-}"; do
  if [ -n "$entry" ]; then echo "STUDIO_DATA_${entry%%:*}=${entry#*:}"; fi
done
