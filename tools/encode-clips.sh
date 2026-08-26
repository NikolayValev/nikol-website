#!/usr/bin/env bash
# One-time clip encoder. Requires ffmpeg (not currently installed).
# Usage: tools/encode-clips.sh _source/video/*.mov
set -euo pipefail

out="assets/video"
mkdir -p "$out"

for src in "$@"; do
  name="$(basename "${src%.*}")"
  ffmpeg -nostdin -i "$src" \
    -vf "scale='min(1920,iw)':-2" \
    -c:v libx264 -profile:v high -crf 23 -preset slow \
    -c:a aac -b:a 128k -movflags +faststart \
    "$out/$name.mp4"
  ffmpeg -nostdin -i "$src" -vf "thumbnail,scale='min(1280,iw)':-2" \
    -frames:v 1 -q:v 4 "$out/$name-poster.jpg"
  echo "encoded $name"
done
