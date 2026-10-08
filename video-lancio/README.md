# Video di lancio · Dieci Bottega

`Dieci_Bottega_lancio.mp4` · 1080×1920 · 31,5 s · 30 fps · audio originale sintetizzato.

- `lancio.html`: animazione (timeline deterministica `render(t)`), font del brand in `assets/`.
- `audio.py`: musica + effetti sincronizzati. `python3 audio.py lancio.wav`
- `render.py`: `python3 render.py video lancio_muto.mp4` poi mux con ffmpeg.

Regia (skill LottieFiles motion-design): personalità Premium/Corporate, nessun rimbalzo (brand: 150–400 ms),
easing firma entrata (0.2,0,0,1) / uscita (0.3,0,1,1) / spostamenti (0.4,0,0.2,1), tre livelli di movimento
(principale: titoli a maschera e numeri · secondario: linee, pallini dei giorni, cursore · ambientale: grana, barra, micro-zoom).

Scene: gancio "Quanto aspetti un sito?" 30→60→90 giorni → svolta 90→10 "Veloci, non frettolosi" → processo in 4 fasi
→ prezzo come promessa (listino) → AI + mestiere (sito che si costruisce) → promesse della bottega → chiusura con logo e CTA.
