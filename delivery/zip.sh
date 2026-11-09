#!/bin/bash
# Zip a finished package: remove .DS_Store, zip without extended attributes, print size and file count.
# usage: delivery/zip.sh PACKAGE_DIR [ZIP_PATH]
# Uses /bin/rm and /usr/bin/zip by absolute path: interactive zsh aliases for rm/zip broke the real run.
set -euo pipefail
PKG="${1:?usage: zip.sh PACKAGE_DIR [ZIP_PATH]}"
PKG="$(cd "$PKG" && pwd)"
NAME="$(basename "$PKG")"
ZIP="${2:-$(dirname "$PKG")/${NAME}_$(date +%Y-%m-%d).zip}"
ZIP="$(cd "$(dirname "$ZIP")" && pwd)/$(basename "$ZIP")"   # absolute: the zip runs from the package's parent
/usr/bin/find "$PKG" -name .DS_Store -exec /bin/rm -f {} +
/bin/rm -f "$ZIP"
( cd "$(dirname "$PKG")" && /usr/bin/zip -r -q -X "$ZIP" "$NAME" )
COUNT=$(/usr/bin/unzip -Z1 "$ZIP" | /usr/bin/grep -vc '/$' || true)
SIZE=$(/usr/bin/stat -f %z "$ZIP" 2>/dev/null || /usr/bin/stat -c %s "$ZIP")
echo "zip: $ZIP"
echo "files: $COUNT, bytes: $SIZE"
