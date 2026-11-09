#!/usr/bin/env bash
# Render the site visuals and encode them for the page: H.264 yuv420p, no audio, CRF 20,
# faststart, plus a same-named .jpg poster (a representative frame).
#   ./render.sh                 # all four
#   ./render.sh hero twins      # some
# Renders land in <name>/renders/ (ignored); the page files in ../public/visuals/.
set -euo pipefail
cd "$(dirname "$0")"
OUT=../public/visuals
mkdir -p "$OUT"
node build.mjs "$@"

poster_at() {
  case "$1" in
    hero) echo 2.8 ;;      # punched in, the caption plate landed
    pipeline) echo 9.1 ;;  # Build: three tracks snapped to the down:send anchor
    twins) echo 3.6 ;;     # both twins mid-line: caption plate left, waveform right
    audit) echo 2.4 ;;     # the hold caught
  esac
}

for name in ${@:-hero pipeline twins audit}; do
  (cd "$name" && npx --yes hyperframes@0.9.16 render -o "renders/$name.mp4" --fps 30 --quality delivery --quiet)
  ffmpeg -y -hide_banner -loglevel error -i "$name/renders/$name.mp4" -an \
    -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 20 -preset slow -movflags +faststart \
    "$OUT/$name.mp4"
  ffmpeg -y -hide_banner -loglevel error -ss "$(poster_at "$name")" -i "$OUT/$name.mp4" -frames:v 1 -q:v 5 "$OUT/$name.jpg"
  ls -la "$OUT/$name.mp4" "$OUT/$name.jpg"
done
