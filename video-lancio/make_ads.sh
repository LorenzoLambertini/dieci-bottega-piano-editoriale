#!/bin/sh
# Genera le due versioni sponsorizzate di C01 (Meta, obiettivo Messaggi): A ≈35 s, B ≈26 s
cd "$(dirname "$0")"
mkdir -p ../media/ads
for V in A B; do
  ( PAGINA="c01ads.html?v=$V" python3 render.py video ads_$V.mp4 > ads_$V.log 2>&1 \
    && python3 audio_ads_$V.py ads_$V.wav >> ads_$V.log \
    && ffmpeg -v error -y -i ads_$V.mp4 -i ads_$V.wav -c:v libx264 -crf 22 -preset slow -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart ../media/ads/C01_ads_$V.mp4 \
    && rm -f ads_$V.mp4 ads_$V.wav && echo FATTO >> ads_$V.log ) &
done
wait
