#!/usr/bin/env python3
"""Dieci Bottega · generatore di template Reel per CapCut.

Crea un overlay 1080x1920 su green screen (#00FF00) con:
 - scritte del brand che entrano a tendina (300 ms, niente rimbalzi),
 - transizioni a pannello Rosewood sui tagli (coprono il cambio clip),
 - barra di avanzamento, logo 10/B ed etichetta in alto,
 - schermata finale,
 - audio: base musicale originale + whoosh, tick e chime sincronizzati.

Uso: python3 scripts/reel-template.py template-capcut/P03/spec.json
"""
import json, os, subprocess, sys, tempfile, wave
import numpy as np
from PIL import Image, ImageDraw, ImageFont

W, H, FPS, SR = 1080, 1920, 30, 48000
GREEN = (0, 255, 0)
ROSE, OBS, IVORY, PEACH, BURG = (230, 59, 46), (26, 20, 20), (244, 239, 230), (242, 184, 162), (122, 24, 24)
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"

spec_path = sys.argv[1]
base = os.path.dirname(os.path.abspath(spec_path))
spec = json.load(open(spec_path))
scene = spec["scene"]                      # [{"durata": s, "overlay": "file.png"}]
END = spec.get("finale_durata", 3.0)
cuts = np.cumsum([0] + [s["durata"] for s in scene])  # inizio di ogni scena
T = float(cuts[-1] + END)
NF = int(round(T * FPS))
rel = lambda p: p if os.path.isabs(p) else os.path.join(base, p)

def ease(x):  # ease-out cubic
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3

# ---------- asset
boxes = []
for s in scene:
    o = Image.open(rel(s["overlay"])).convert("RGBA")
    a = o.split()[3].point(lambda v: 255 if v >= 128 else 0)
    bb = a.getbbox()
    crop = o.convert("RGB").crop(bb); mask = a.crop(bb)
    boxes.append((crop, mask, bb))
endcard = Image.open(rel(spec["finale"])).convert("RGB")
ec = np.array(endcard).astype(int)
red = (ec[:, :, 0] > 180) & (ec[:, :, 1] < 120) & (ec[:, :, 2] < 120)
y0, y1, x0, x1 = 707, 874, 386, 693        # logo 10/B nella endcard del kit
logo = Image.fromarray(np.where(red[y0:y1 + 1, x0:x1 + 1, None], np.array(ROSE), np.array(GREEN)).astype("uint8"))
logo_mask = Image.fromarray((red[y0:y1 + 1, x0:x1 + 1] * 255).astype("uint8"))
lw = 120; lh = int(logo.height * lw / logo.width)
logo = logo.resize((lw, lh), Image.NEAREST); logo_mask = logo_mask.resize((lw, lh), Image.NEAREST)
font = ImageFont.truetype(MONO, 26)
label = spec.get("etichetta", "DIECI BOTTEGA").upper()

TR = 0.20   # metà transizione (totale 400 ms)

def frame(t):
    im = Image.new("RGB", (W, H), GREEN)
    d = ImageDraw.Draw(im)
    if t < cuts[-1] - TR:
        # barra di avanzamento
        d.rectangle([48, 72, W - 48, 77], fill=OBS)
        d.rectangle([48, 72, 48 + int((W - 96) * t / cuts[-1]), 77], fill=IVORY)
        im.paste(logo, (48, 104), logo_mask)
        tw = d.textlength(label, font=font)
        d.rectangle([W - 48 - tw - 28, 104, W - 48, 104 + 48], fill=OBS)
        d.text((W - 48 - tw - 14, 113), label, font=font, fill=IVORY)
    # scritta della scena
    i = int(np.searchsorted(cuts, t, side="right") - 1)
    if 0 <= i < len(scene):
        crop, mask, bb = boxes[i]
        k_in = ease((t - cuts[i] - 0.15) / 0.30)
        k_out = ease((cuts[i + 1] - TR - t) / 0.18) if i < len(scene) - 1 or True else 1
        k = min(k_in, k_out)
        if k > 0:
            w = max(1, int(crop.width * k)); dy = int(40 * (1 - k_in))
            im.paste(crop.crop((0, 0, w, crop.height)), (bb[0], bb[1] + dy), mask.crop((0, 0, w, crop.height)))
            # accento Rosewood che precede la tendina
            ax = bb[0] + w
            if k < 1: d.rectangle([ax, bb[1] + dy, min(ax + 14, W), bb[3] + dy], fill=ROSE)
    # finale
    if t >= cuts[-1]:
        k = ease((t - cuts[-1]) / 0.35)
        h = int(H * k)
        im.paste(endcard.crop((0, H - h, W, H)) if h < H else endcard, (0, H - h))
    # transizioni a pannello sui tagli (anche verso il finale)
    for c in cuts[1:]:
        u = (t - (c - TR)) / (2 * TR)
        if 0 <= u <= 1:
            col = ROSE if c < cuts[-1] else BURG
            if u < 0.5:
                x = int(W * ease(u * 2)); d.rectangle([0, 0, x, H], fill=col)
            else:
                x = int(W * ease((u - 0.5) * 2)); d.rectangle([x, 0, W, H], fill=col)
    return im

# ---------- audio originale (sintetizzato, nessun diritto d'autore)
rng = np.random.default_rng(10)
n = int(T * SR); tt = np.arange(n) / SR
def env(L, a=0.005, r=0.2):
    x = np.arange(L) / SR; return np.minimum(1, x / a) * np.exp(-x / r)
def add(buf, sig, at, g=1.0):
    s = int(at * SR); e = min(len(buf), s + len(sig))
    if s < len(buf): buf[s:e] += g * sig[: e - s]
BPM = spec.get("bpm", 100); beat = 60 / BPM
music = np.zeros(n); sfx = np.zeros(n)
# kick morbida
L = int(0.35 * SR); x = np.arange(L) / SR
kick = np.sin(2 * np.pi * (50 + 90 * np.exp(-x * 30)) * x) * env(L, 0.002, 0.12)
hat = rng.normal(0, 1, int(0.05 * SR)); hat = np.diff(hat, prepend=0) * env(len(hat), 0.001, 0.015)
snap = rng.normal(0, 1, int(0.18 * SR)) * env(int(0.18 * SR), 0.001, 0.05)
# accordi caldi (Fmaj7 - Dm9 - Bbmaj7 - C6) con pad filtrato
chords = [[174.6, 220.0, 261.6, 329.6], [146.8, 174.6, 220.0, 329.6], [116.5, 174.6, 220.0, 293.7], [130.8, 196.0, 220.0, 329.6]]
bar = 4 * beat; t_end_music = cuts[-1] + END
b = 0; tb = 0.0
while tb < t_end_music:
    ch = chords[b % 4]; Lp = int(bar * SR); xp = np.arange(Lp) / SR
    pad = sum(np.sin(2 * np.pi * f * xp + 0.3 * np.sin(2 * np.pi * 0.5 * xp)) + 0.3 * np.sin(2 * np.pi * 2 * f * xp) for f in ch)
    pad *= np.minimum(1, xp / 0.4) * np.minimum(1, (bar - xp) / 0.4)
    add(music, pad * 0.035, tb)
    for q in range(4):
        tq = tb + q * beat
        if tq < cuts[-1]:
            if q in (0, 2): add(music, kick, tq, 0.55)
            if q in (1, 3): add(music, snap, tq, 0.10)
            add(music, hat, tq + beat / 2, 0.10)
    tb += bar; b += 1
# basso: radice dell'accordo
# sfx
Lw = int(0.45 * SR); xw = np.arange(Lw) / SR
noise = rng.normal(0, 1, Lw)
spec_w = np.fft.rfft(noise); freqs = np.fft.rfftfreq(Lw, 1 / SR)
whoosh = np.zeros(Lw)
for j in range(9):  # sweep a blocchi
    seg = slice(j * Lw // 9, (j + 1) * Lw // 9)
    fc = 400 + 3000 * np.sin(np.pi * (j + 0.5) / 9)
    flt = np.exp(-((freqs - fc) / (fc * 0.6)) ** 2)
    whoosh[seg] = np.fft.irfft(spec_w * flt, Lw)[seg]
whoosh *= np.sin(np.pi * xw / xw[-1]) ** 2; whoosh /= np.abs(whoosh).max()
Lt = int(0.09 * SR); xt = np.arange(Lt) / SR
tick = (np.sin(2 * np.pi * 1600 * xt) + 0.5 * np.sin(2 * np.pi * 2400 * xt)) * env(Lt, 0.001, 0.02)
Lc = int(1.6 * SR); xc = np.arange(Lc) / SR
chime = sum(np.sin(2 * np.pi * f * xc) * np.exp(-xc * 2.5) for f in (880, 1318.5, 1760)) / 3
for c in cuts[1:]:
    add(sfx, whoosh, c - 0.25, 0.30)
for i in range(len(scene)):
    add(sfx, tick, cuts[i] + 0.15, 0.22)
add(sfx, chime, cuts[-1] + 0.05, 0.35)
# riverbero leggero sulla musica + fade finale
music = music + 0.25 * np.concatenate([np.zeros(int(0.09 * SR)), music[: -int(0.09 * SR)]])
music *= np.clip((T - tt) / 1.2, 0, 1)
def norm(x, peak): return x / (np.abs(x).max() + 1e-9) * peak
music, sfx = norm(music, 0.45), norm(sfx, 0.7)
mix = np.clip(music + sfx, -0.98, 0.98)

def wav(path, x):
    with wave.open(path, "wb") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        s = (x * 32767).astype("<i2"); w.writeframes(np.column_stack([s, s]).tobytes())

out = os.path.join(base, spec.get("nome", "reel"))
tmp = tempfile.mkdtemp()
wav(f"{tmp}/mix.wav", mix); wav(f"{out}_musica.wav", music); wav(f"{out}_effetti.wav", sfx)
p = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                      "-i", f"{tmp}/mix.wav", "-c:v", "libx264", "-crf", "14", "-preset", "medium", "-pix_fmt", "yuv420p",
                      "-c:a", "aac", "-b:a", "256k", "-shortest", f"{out}_OVERLAY_greenscreen.mp4"], stdin=subprocess.PIPE)
for f in range(NF):
    p.stdin.write(frame(f / FPS).tobytes())
p.stdin.close(); p.wait()
print(f"{out}_OVERLAY_greenscreen.mp4  ({T:.1f}s, tagli a {', '.join(f'{c:.0f}s' for c in cuts[1:])})")
