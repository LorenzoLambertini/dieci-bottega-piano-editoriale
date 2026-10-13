#!/bin/sh
# Genera il reel C01 "3 errori che ti fanno perdere clienti" (analisi gratuita fino al 31/10/2026)
cd "$(dirname "$0")"
PAGINA=c01.html python3 render.py video c01_muto.mp4 > c01.log 2>&1 \
 && python3 audio_c01.py c01.wav >> c01.log \
 && ffmpeg -v error -y -i c01_muto.mp4 -i c01.wav -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart ../media/reel/C01c.mp4 \
 && rm -f c01_muto.mp4 c01.wav && echo FATTO >> c01.log
