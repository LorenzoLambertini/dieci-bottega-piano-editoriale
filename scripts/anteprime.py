#!/usr/bin/env python3
"""Genera i dati e le miniature dell'app "Prossime uscite" (cartella anteprime/).

Uso: python3 scripts/anteprime.py [giorni]   (default 45 giorni da adesso)
Poi si ripubblica l'artifact con anteprime/index.html + data.json + img/.
"""
import json, os, subprocess, sys, datetime as dt
from PIL import Image

GIORNI = int(sys.argv[1]) if len(sys.argv) > 1 else 45
OUT = "anteprime"
IMG = os.path.join(OUT, "img")
os.makedirs(IMG, exist_ok=True)
coda = json.load(open("coda/coda.json"))
base = coda.get("baseUrl", "")
adesso = dt.datetime.now(dt.timezone.utc)
limite = adesso + dt.timedelta(days=GIORNI)
usate = set()

def thumb(src, nome, w):
    dst = os.path.join(IMG, nome)
    usate.add(nome)
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        return "img/" + nome
    im = Image.open(src).convert("RGB")
    im.thumbnail((w, w * 2))
    im.save(dst, "JPEG", quality=78, optimize=True, progressive=True)
    return "img/" + nome

def poster(video, nome):
    dst = os.path.join(IMG, nome)
    usate.add(nome)
    if not (os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(video)):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "2.5", "-i", video, "-frames:v", "1",
                        "-vf", "scale=360:-2", "-q:v", "4", dst], check=True)
    return "img/" + nome

def durata(video):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video],
                       capture_output=True, text=True)
    try: return round(float(r.stdout.strip()))
    except ValueError: return None

items = []
for x in coda["contenuti"]:
    due = dt.datetime.fromisoformat(x["dueAt"].replace("Z", "+00:00"))
    if due < adesso - dt.timedelta(hours=1) or due > limite:
        continue
    ch = x["canali"]
    rif = ch.get("instagram") or next(iter(ch.values()))
    it = {"id": x["id"], "titolo": x["titolo"], "tipo": x["tipo"], "quando": x["quando"], "dueAt": x["dueAt"],
          "slide": [], "poster": None, "video": None, "durata": None, "canali": {}}
    if rif.get("immagini"):
        it["slide"] = [thumb(p, f"{x['id']}_{i+1:02d}.jpg", 540) for i, p in enumerate(rif["immagini"]) if os.path.exists(p)]
    video = next((c.get("video") for c in ch.values() if c.get("video")), None)
    if video:
        if os.path.exists(video):
            it["poster"] = poster(video, f"{x['id']}_poster.jpg")
            it["video"] = base + video
            it["durata"] = durata(video)
    for s, c in ch.items():
        it["canali"][s] = {"stato": c.get("stato"), "testo": c.get("testo", ""),
                           "formato": "documento" if c.get("documento") else ("video" if c.get("video") else ("immagini" if c.get("immagini") else "testo")),
                           "errore": c.get("ultimoErrore")}
    if x.get("sostituzioni"): it["sostituzioni"] = x["sostituzioni"]
    items.append(it)

for f in os.listdir(IMG):
    if f not in usate: os.remove(os.path.join(IMG, f))

json.dump({"aggiornato": adesso.isoformat(timespec="minutes"), "contenuti": items},
          open(os.path.join(OUT, "data.json"), "w"), ensure_ascii=False, indent=1)
files = {"data.json": "anteprime/data.json", **{f"img/{f}": f"anteprime/img/{f}" for f in sorted(usate)}}
json.dump(files, open(os.path.join(OUT, "files.json"), "w"), indent=1)
print(f"{len(items)} contenuti, {len(usate)} immagini · mappa file per la pubblicazione in anteprime/files.json")
