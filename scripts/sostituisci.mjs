// Dieci Bottega · sostituzione automatica dei contenuti senza materiale.
// Regola: se mancano 2 ore (o meno) all'uscita di un contenuto e manca ancora qualcosa
// (video, clip, indicazioni: stato "manca_video" o "manca_materiale"), lo scambio di data
// con il contenuto pronto più adatto. Il contenuto senza materiale prende la data dell'altro.
// Nessuna chiamata a Buffer: segna i post da spostare con daAggiornare, poi ci pensa buffer-sync.
import fs from "node:fs";

const CODA = "coda/coda.json";
const LOG = "coda/sostituzioni.md";
const DRY = fs.existsSync("coda/.prova") || process.env.DRY_RUN === "1";
const ANTICIPO_MS = Number(process.env.ANTICIPO_ORE || 2) * 3600e3;
const FINESTRA_GG = 21;
const ADESSO = process.env.ADESSO ? Date.parse(process.env.ADESSO) : Date.now();
const MANCA = ["manca_video", "manca_materiale"];
const PRONTO = ["programmato", "da_programmare", "gia_in_buffer"];

const coda = JSON.parse(fs.readFileSync(CODA, "utf8"));
const programmati = fs.existsSync("coda/buffer-programmati.json") ? JSON.parse(fs.readFileSync("coda/buffer-programmati.json", "utf8")) : {};
const t = (i) => new Date(i.dueAt).getTime();
const giornoRoma = (ms) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const ora = (i) => i.quando.slice(11);
const serie = (i) => i.id[0];
const esiste = (p) => !p || /^https?:/.test(p) || fs.existsSync(p);

function pronto(i) {
  return Object.values(i.canali).every((c) =>
    PRONTO.includes(c.stato) && esiste(c.video) && esiste(c.documento) && (c.immagini || []).every(esiste));
}
function senzaMateriale(i) { return Object.values(i.canali).some((c) => MANCA.includes(c.stato)); }

// contenuto pubblicato (o in uscita) subito prima dello slot, per non ripetere lo stesso tipo di contenuto
function precedente(x) {
  return coda.contenuti.filter((i) => t(i) < t(x) && !senzaMateriale(i) && !Object.values(i.canali).every((c) => c.stato === "scaduto"))
    .sort((a, b) => t(b) - t(a))[0];
}

function punteggio(x, y, prima) {
  let p = 0;
  if (y.tipo === x.tipo) p += 4;                       // un reel resta un reel, un carosello un carosello
  if (ora(y) === ora(x)) p += 2;                       // rispetta il ritmo degli orari (12:30 post, 18:30 reel)
  if (serie(y) === serie(x)) p += 1;                   // stessa famiglia di contenuto (P identità, R rubriche, S strategia)
  if ((t(y) - t(x)) / 864e5 >= 4) p += 2;              // prende un contenuto lontano: non svuota i prossimi giorni
  if (prima && prima.tipo === y.tipo && serie(prima) === serie(y) && prima.titolo.split(" ")[0] === y.titolo.split(" ")[0]) p -= 3; // evita doppioni ravvicinati
  return p;
}

function sposta(i, nuovoQuando, nuovoDue) {
  i.quando = nuovoQuando; i.dueAt = nuovoDue;
  for (const [servizio, c] of Object.entries(i.canali)) {
    if (c.stato === "programmato" && c.bufferId) c.daAggiornare = true;
    else if (c.stato === "gia_in_buffer") {
      // post caricato su Buffer da fuori: lo ritrovo per giorno e lo ricreo alla nuova data
      const vecchio = (programmati[servizio] || []).find((p) => giornoRoma(new Date(p.dueAt).getTime()) === giornoRoma(i._vecchioDue));
      if (vecchio) { c.bufferId = vecchio.id; c.stato = "programmato"; c.daAggiornare = true; }
      else c.stato = "da_programmare";
    }
  }
}

const daSostituire = coda.contenuti.filter((x) => senzaMateriale(x) && t(x) > ADESSO && t(x) - ADESSO <= ANTICIPO_MS);
const fatte = [];
for (const x of daSostituire) {
  const prima = precedente(x);
  const candidati = coda.contenuti.filter((y) => y !== x && t(y) > t(x) && t(y) - t(x) <= FINESTRA_GG * 864e5 && pronto(y));
  if (!candidati.length) { fatte.push(`- ${new Date().toISOString()} · ${x.id} senza materiale, nessun contenuto pronto per sostituirlo`); continue; }
  candidati.sort((a, b) => punteggio(x, b, prima) - punteggio(x, a, prima) || t(a) - t(b));
  const y = candidati[0];
  const [qx, dx, qy, dy] = [x.quando, x.dueAt, y.quando, y.dueAt];
  y._vecchioDue = t(y); x._vecchioDue = t(x);
  sposta(y, qx, dx);
  sposta(x, qy, dy);
  delete y._vecchioDue; delete x._vecchioDue;
  (x.sostituzioni ||= []).push({ il: new Date().toISOString(), da: qx, a: qy, conContenuto: y.id });
  fatte.push(`- ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome" })} · ${x.id} "${x.titolo}" (mancava il materiale) spostato al ${qy}; al suo posto il ${qx} esce ${y.id} "${y.titolo}"`);
}

for (const r of fatte) console.log(r);
const cambiato = fatte.some((r) => r.includes("spostato"));
if (fatte.length && !DRY) {
  if (cambiato) {
    coda.contenuti.sort((a, b) => t(a) - t(b));
    fs.writeFileSync(CODA, JSON.stringify(coda, null, 2) + "\n");
  }
  const testa = fs.existsSync(LOG) ? fs.readFileSync(LOG, "utf8") : "# Sostituzioni automatiche\n\nContenuti senza materiale scambiati con contenuti pronti 2 ore prima dell'uscita.\n\n";
  fs.writeFileSync(LOG, testa + fatte.join("\n") + "\n");
}
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `cambiato=${cambiato && !DRY ? 1 : 0}\n`);
if (!fatte.length) console.log("Nessun contenuto da sostituire.");
