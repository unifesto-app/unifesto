#!/bin/sh
# The 5.0 launch video, 1080x1920 for Reels, Shorts and LinkedIn: the store app preview inside a phone on
# the Horizon sky, a caption per scene, then the "Update to 5.0" card. Writes out/launch-reel.mp4.
#
#   python3 render.py reel story && sh reel.sh [path/to/preview.mp4]
#
# The preview comes from ../store-5.0 (python3 preview.py). Scene times match FLOW in ../store-5.0/preview.html.
set -e
cd "$(dirname "$0")"
PREVIEW=${1:-../store-5.0/out/preview.mp4}
R=out/reel
CUTS="0 3.6 7.2 10.9 14.4 17.9 21.6 25.6 29"   # scene starts, then the preview's end

# a caption overlay per scene, each shown from its scene's start to the next one's
chain="[base]"; i=0; set -- $CUTS; prev=$1; shift
for next in "$@"; do
  n=$((i + 3)); out="[c$i]"
  filters="$filters${chain}[$n:v]overlay=enable='between(t,$prev,$next)'$out;"
  chain=$out; prev=$next; i=$((i + 1))
done

ffmpeg -v error -y \
  -loop 1 -t 29 -framerate 30 -i $R/01.png -i "$PREVIEW" -loop 1 -t 29 -framerate 30 -i $R/02.png \
  $(for n in 03 04 05 06 07 08 09 10; do printf -- '-loop 1 -t 29 -framerate 30 -i %s/%s.png ' $R $n; done) \
  -loop 1 -t 3 -framerate 30 -i out/story/03.png -i ../reel-01/soundtrack.wav \
  -filter_complex "[1:v]scale=640:1386,setsar=1,fps=30[app];[0:v][app]overlay=220:498[s];[s][2:v]overlay=0:0[base];${filters}${chain}format=yuv420p,setsar=1[main];[11:v]format=yuv420p,setsar=1,fps=30[end];[main][end]xfade=transition=fade:duration=0.5:offset=28.5[v];[12:a]atrim=0:30,apad=pad_dur=1.5,afade=t=out:st=29.5:d=2[a]" \
  -map "[v]" -map "[a]" -t 31.5 -c:v libx264 -preset slow -crf 18 -profile:v high -pix_fmt yuv420p -r 30 \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart out/launch-reel.mp4
echo out/launch-reel.mp4
