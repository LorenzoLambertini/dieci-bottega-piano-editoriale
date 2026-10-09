#!/usr/bin/env python3
"""Aggiorna i prezzi sulla slide 6 del carosello Listino (P04) con il listino nuovo."""
from PIL import Image, ImageDraw, ImageFont
import numpy as np, sys
A='video-lancio/assets/'
BG=(242,184,162); INK=(122,24,24)
src='media/post/P04/slide06.png'
im=Image.open(src).convert('RGB'); d=ImageDraw.Draw(im)
def cardo(sz): return ImageFont.truetype(A+'Cardo-Italic.ttf',sz)
def mono(sz):
    f=ImageFont.truetype(A+'JetBrainsMono.ttf',sz)
    try: f.set_variation_by_axes([500])
    except Exception: pass
    return f
# calibra le dimensioni sul testo originale
def w_cardo(t,sz): return d.textlength(t,font=cardo(sz))
sz=min(range(40,90),key=lambda s:abs(w_cardo('800 — 1.100 €',s)-350))
def mono_w(t,sz,tr): f=mono(sz); return sum(d.textlength(ch,font=f) for ch in t)+tr*(len(t)-1)
best=min(((s,tr) for s in range(18,30) for tr in [x/2 for x in range(0,12)]),key=lambda p:abs(mono_w('5-7 GIORNI',*p)-147)+abs(mono_w('10 GIORNI · IL PIÙ SCELTO',*p)-375))
ms,tr=21,1.0; print('cardo',sz,'mono',ms,tr)
def right_text(t,y_top_ink,x_right):
    f=cardo(sz); bb=d.textbbox((0,0),t,font=f); w=bb[2]-bb[0]
    d.text((x_right-bb[2], y_top_ink-bb[1]), t, font=f, fill=INK)
def mono_text(t,x,y_top_ink):
    f=mono(ms); bb=d.textbbox((0,0),'G',font=f); xx=x
    for ch in t:
        d.text((xx, y_top_ink-bb[1]), ch, font=f, fill=INK); xx+=d.textlength(ch,font=f)+tr
# pulisci le zone
d.rectangle([540,598,1000,660],fill=BG); d.rectangle([540,756,1000,818],fill=BG)
d.rectangle([80,668,520,700],fill=BG); d.rectangle([80,822,600,856],fill=BG)
right_text('800 — 1.000 €',608,998)
right_text('1.500 — 2.000 €',766,998)
mono_text('CIRCA 7 GIORNI',85,673)
mono_text('10–14 GIORNI · IL PIÙ SCELTO',85,827)
im.save(sys.argv[1] if len(sys.argv)>1 else src)
