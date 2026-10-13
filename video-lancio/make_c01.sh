#!/bin/sh
# Genera il reel C01 "3 errori che ti fanno perdere clienti" (analisi gratuita fino al 31/10/2026)
cd "$(dirname "$0")"
PAGINA=c01.html python3 render.py video c01_muto.mp4 > c01.log 2>&1 \
 && python3 audio_c01.py c01.wav >> c01.log \
 && ffmpeg -v error -y -i c01_muto.mp4 -i c01.wav -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p -c:a aac -b:a 256k -shortest -movflags +faststart c01_tmp.mp4 && ffmpeg -v error -y -i c01_tmp.mp4 -vf "tpad=stop_mode=clone:stop_duration=1.5" -af "apad=pad_dur=1.5" -c:v libx264 -crf 24 -preset slow -pix_fmt yuv420p -c:a aac -b:a 256k -movflags +faststart ../media/reel/C01d.mp4 && rm -f c01_tmp.mp4 \
 && rm -f c01_muto.mp4 c01.wav && echo FATTO >> c01.log
