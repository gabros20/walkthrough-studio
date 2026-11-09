#!/bin/bash
# down.sh: stop only the processes this stack started ($STUDIO_RUN/*.pid) and their children, in
# reverse start order. Safe to repeat. Never touches anything else listening on the machine.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
for svc in $(services_reversed); do stop_svc "$svc"; done
echo "studio stack stopped"
