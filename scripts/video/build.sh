#!/usr/bin/env bash
# Step 4 of the demo video: mix narration with music, mux with the footage,
# and cut the poster frame. Run from anywhere: bash scripts/video/build.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
CACHE=scripts/video/.cache
OUT=docs/demo-video
MUSIC_GAIN=0.14   # keeps the music bed well under the voice

ffmpeg -y -loglevel error \
  -i "$CACHE/footage.mp4" -i "$CACHE/narration.wav" -i "$CACHE/music.wav" \
  -filter_complex "[1:a]aresample=48000,pan=stereo|c0=c0|c1=c0[voice];\
[2:a]aresample=48000,volume=${MUSIC_GAIN}[music];\
[voice][music]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[mix]" \
  -map 0:v -map "[mix]" -c:v copy -c:a aac -b:a 192k -movflags +faststart -shortest \
  "$OUT/causal-universe-demo.mp4"

# Poster: the closing card over the live comparison.
ffmpeg -y -loglevel error -ss 126 -i "$OUT/causal-universe-demo.mp4" -frames:v 1 -q:v 2 "$OUT/poster.jpg"
echo "wrote $OUT/causal-universe-demo.mp4 and $OUT/poster.jpg"
