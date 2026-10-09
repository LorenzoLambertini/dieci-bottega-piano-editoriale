#!/bin/sh
# Rigenera il video di lancio: frame + audio + mux
cd "$(dirname "$0")"
python3 render.py video lancio_muto.mp4 > render.log 2>&1 \
 && python3 audio.py lancio.wav >> render.log \
 && ffmpeg -v error -y -i lancio_muto.mp4 -i lancio.wav -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart Dieci_Bottega_lancio.mp4 \
 && rm -f lancio_muto.mp4 lancio.wav && echo FATTO >> render.log
