#!/bin/sh
# Rigenera il reel R05 "Quanto costa un sito?" con il listino attuale
cd "$(dirname "$0")"
PAGINA=r05.html python3 render.py video r05_muto.mp4 > r05.log 2>&1 \
 && python3 audio_r05.py r05.wav >> r05.log \
 && ffmpeg -v error -y -i r05_muto.mp4 -i r05.wav -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart R05_listino.mp4 \
 && rm -f r05_muto.mp4 r05.wav && echo FATTO >> r05.log
