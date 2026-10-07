# Dieci Bottega · Piano editoriale

- `index.html` — l'app del piano editoriale (GitHub Pages).
- Regola: ogni contenuto esce lo stesso giorno su Instagram, Facebook e LinkedIn.
- `coda/coda.json` — **la coda unica di tutti i contenuti social** (post + reel), con testi per canale, media e stato.
- `coda/STATO.md` — riepilogo aggiornato a ogni controllo: slot liberi su Buffer, prossimi contenuti, errori.
- `media/` — immagini, PDF e video, serviti da GitHub Pages così Buffer li può scaricare.
- `scripts/buffer-sync.mjs` + `.github/workflows/buffer-sync.yml` — due volte al giorno controlla quanti post sono programmati su ogni canale Buffer e riempie gli slot liberi (piano gratuito: 10 per canale) con i prossimi contenuti in ordine di data.

## Testi per canale

Stesso contenuto e stesso giorno ovunque, ma il testo cambia con il social:
- **Instagram**: breve, domanda per i commenti, 5 hashtag.
- **Facebook**: tono da vicino di bottega, una domanda, niente muri di hashtag, link solo quando serve (con UTM).
- **LinkedIn**: punto di vista dell'imprenditore, risposta e fonte subito, cosa cambia per un'azienda, 3 hashtag.

## Come funziona

1. Ogni contenuto in `coda.json` ha una data (`quando`, ora italiana) e, per ogni canale, uno `stato`.
2. La Action prende i contenuti `da_programmare`, li manda a Buffer alla loro data e li segna `programmato`.
3. Quando un post esce, si libera uno slot e al giro successivo entra il prossimo.

Stati: `da_programmare`, `programmato`, `gia_in_buffer` (quel giorno c'era già un post su quel canale), `manca_video`, `scaduto` (data passata prima di essere programmato), `errore`, `pausa` (saltato finché non lo rimetti `da_programmare`).

## Setup (una volta)

1. Buffer → Settings → API → crea una chiave personale.
2. GitHub → questo repo → Settings → Secrets and variables → Actions → New repository secret: nome `BUFFER_API_KEY`, valore la chiave.
3. Actions → "Riempi Buffer" → Run workflow (prima con "Solo prova" spuntato, poi senza).

## Aggiungere o cambiare contenuti

Si modifica `coda/coda.json` (o si chiede a Claude di farlo). I file vanno in `media/`.
