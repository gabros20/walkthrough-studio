#!/bin/bash
# tree.sh [--build]: make $STUDIO_TREE a fresh copy of the developer's repo ($STUDIO_SOURCE).
#
# On APFS the copy is a clone (cp -c): it takes seconds, uses no extra space until files differ,
# and node_modules comes along, so no install is needed. The developer's repo is only read.
# Entries in STUDIO_TREE_REMOVE (default: .git) are deleted from the copy, so nothing in the
# studio can commit or push. The old tree is replaced only after the new one is complete.
# --build then runs STUDIO_BUILD inside the tree: use it for a production build, which drops dev
# overlays (framework dev badges, error overlays, hot-reload indicators) from the footage.
# Refuses while any service of this stack is running.
set -euo pipefail
source "$(dirname "$0")/lib.sh"
[ -n "${STUDIO_SOURCE:-}" ] || die "STUDIO_SOURCE is not set"
[ -d "$STUDIO_SOURCE" ] || die "STUDIO_SOURCE $STUDIO_SOURCE does not exist"
src="$(cd "$STUDIO_SOURCE" && pwd)"
case "$STUDIO_TREE/" in "$src"/*) die "STUDIO_TREE is inside STUDIO_SOURCE; refusing" ;; esac
case "$src/" in "$STUDIO_TREE"/*) die "STUDIO_SOURCE is inside STUDIO_TREE; refusing" ;; esac
for svc in "${STUDIO_SERVICES[@]}"; do
  if alive "$(pidof_svc "$svc")"; then die "$svc is running; run down.sh first"; fi
done
new="$STUDIO_TREE.new"
/bin/rm -rf "$new"
mkdir -p "$(dirname "$STUDIO_TREE")"
echo "copying $src -> $STUDIO_TREE ($(clone_dir "$src" "$new"))"
remove=("${STUDIO_TREE_REMOVE[@]:-.git}")
for r in "${remove[@]}"; do
  if [ -n "$r" ]; then /bin/rm -rf "${new:?}/$r"; fi
done
if [ -d "$STUDIO_TREE" ]; then /bin/rm -rf "$STUDIO_TREE.old"; mv "$STUDIO_TREE" "$STUDIO_TREE.old"; fi
mv "$new" "$STUDIO_TREE"
/bin/rm -rf "$STUDIO_TREE.old"
if [ "${1:-}" = "--build" ]; then
  [ -n "${STUDIO_BUILD:-}" ] || die "--build given but STUDIO_BUILD is not set"
  echo "building in $STUDIO_TREE (log: $STUDIO_RUN/build.log)"
  ( cd "$STUDIO_TREE" && eval "$STUDIO_BUILD" ) >"$STUDIO_RUN/build.log" 2>&1 || die "build failed; see $STUDIO_RUN/build.log"
fi
echo "tree ready: $STUDIO_TREE"
