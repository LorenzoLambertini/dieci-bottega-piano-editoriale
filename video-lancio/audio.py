#!/usr/bin/env python3
"""Colonna sonora originale del video di lancio (sintetizzata: nessun diritto d'autore).
Musica calda + effetti sincronizzati ai movimenti di lancio.html."""
import numpy as np, wave, sys
SR = 48000; DUR = 31.5
n = int(DUR * SR); tt = np.arange(n) / SR
rng = np.random.default_rng(10)
def env(L, a=.005, r=.2): x = np.arange(L) / SR; return np.minimum(1, x / a) * np.exp(-x / r)
def add(buf, sig, at, g=1.0):
    s = int(at * SR); e = min(len(buf), s + len(sig))
    if 0 <= s < len(buf): buf[s:e] += g * sig[: e - s]
def bez(x1, y1, x2, y2):
    cx=3*x1;bx=3*(x2-x1)-cx;ax=1-cx-bx;cy=3*y1;by=3*(y2-y1)-cy;ay=1-cy-by
    def f(x):
        t=x
        for _ in range(8):
            X=((ax*t+bx)*t+cx)*t-x; d=(3*ax*t+2*bx)*t+cx
            if abs(d)<1e-6: break
            t-=X/d
        t=min(1,max(0,t)); return ((ay*t+by)*t+cy)*t
    return f
music = np.zeros(n); sfx = np.zeros(n)
BPM = 96; beat = 60 / BPM; bar = 4 * beat
# suoni base
L = int(.35*SR); x = np.arange(L)/SR
kick = np.sin(2*np.pi*(48+95*np.exp(-x*32))*x) * env(L, .002, .13)
hat = np.diff(rng.normal(0,1,int(.05*SR)), prepend=0) * env(int(.05*SR), .001, .014)
snap = rng.normal(0,1,int(.16*SR)) * env(int(.16*SR), .001, .045)
chords = [[174.6,220.0,261.6,329.6],[146.8,174.6,220.0,329.6],[116.5,174.6,220.0,293.7],[130.8,196.0,246.9,329.6]]
def pad(ch, dur):
    Lp=int(dur*SR); xp=np.arange(Lp)/SR
    s=sum(np.sin(2*np.pi*f*xp+.3*np.sin(2*np.pi*.5*xp))+.25*np.sin(2*np.pi*2*f*xp) for f in ch)
    return s*np.minimum(1,xp/.35)*np.minimum(1,(dur-xp)/.35)
def bass(f, dur):
    Lb=int(dur*SR); xb=np.arange(Lb)/SR
    return (np.sin(2*np.pi*f/2*xb)+.3*np.sin(2*np.pi*f*xb))*env(Lb,.01,dur*.6)
# struttura: intro (0–3.2) · tensione (3.2–4.6) · groove (4.6–27.9) · chiusura (27.9–fine)
tb=0.0; b=0
while tb < DUR:
    ch=chords[b%4]
    vol = .028 if tb<3.2 else (.012 if tb<4.6 else (.034 if tb<27.9 else .03))
    add(music, pad(ch, bar), tb, vol)
    for q in range(4):
        tq=tb+q*beat
        if tq<3.2 or 4.6<=tq<27.6:
            if q in (0,2): add(music, kick, tq, .55 if tq>=4.6 else .35)
            if q in (1,3) and tq>=4.6: add(music, snap, tq, .1)
            if tq>=4.6: add(music, hat, tq+beat/2, .09); add(music, hat, tq+beat/4, .04)
            if tq>=4.6 and q==0: add(music, bass(ch[0],bar*.9), tq, .09)
    tb+=bar; b+=1
# riser durante il conto alla rovescia
Lr=int(1.4*SR); xr=np.arange(Lr)/SR
riser=rng.normal(0,1,Lr); spec=np.fft.rfft(riser); fr=np.fft.rfftfreq(Lr,1/SR)
riser=np.fft.irfft(spec*np.exp(-((fr-2500)/2200)**2),Lr)*(xr/1.4)**2
add(music, riser/np.abs(riser).max(), 3.2, .25)
# effetti
Lw=int(.45*SR); xw=np.arange(Lw)/SR; nz=rng.normal(0,1,Lw); sp=np.fft.rfft(nz); fq=np.fft.rfftfreq(Lw,1/SR)
whoosh=np.zeros(Lw)
for j in range(9):
    seg=slice(j*Lw//9,(j+1)*Lw//9); fc=400+3200*np.sin(np.pi*(j+.5)/9)
    whoosh[seg]=np.fft.irfft(sp*np.exp(-((fq-fc)/(fc*.6))**2),Lw)[seg]
whoosh*=np.sin(np.pi*xw/xw[-1])**2; whoosh/=np.abs(whoosh).max()
Lt=int(.08*SR); xt=np.arange(Lt)/SR
tick=(np.sin(2*np.pi*1650*xt)+.5*np.sin(2*np.pi*2475*xt))*env(Lt,.001,.018)
tock=np.sin(2*np.pi*900*xt)*env(Lt,.001,.012)
Lc=int(1.8*SR); xc=np.arange(Lc)/SR
chime=sum(np.sin(2*np.pi*f*xc)*np.exp(-xc*2.4) for f in (880,1318.5,1760))/3
Lh=int(.6*SR); xh=np.arange(Lh)/SR
thud=np.sin(2*np.pi*(40+60*np.exp(-xh*20))*xh)*env(Lh,.002,.22)
Lk=int(.03*SR); click=rng.normal(0,1,Lk)*env(Lk,.0005,.004)
T=dict(C=7.0,D=13.7,E=19.2,F=24.6,G=27.9)
for k,v in T.items(): add(sfx, whoosh, v-.42, .32)
for at in (0.0, 7.2, 13.85, 19.35, 24.8, 25.55, 26.3, 28.45): add(sfx, tick, at, .22)
for at in (1.33, 1.93): add(sfx, tock, at, .35)
f=bez(.15,.6,.25,1); prev=90
for i in range(int(1.4*SR/480)):
    t=3.2+i*480/SR; v=round(90+(10-90)*f((t-3.2)/1.4))
    if v!=prev: add(sfx, tock, t, .16); prev=v
add(sfx, thud, 4.6, .7); add(sfx, chime, 4.62, .18)
for i in range(10): add(sfx, tick, 8.0+i*.48, .08)
add(sfx, tock, 16.9, .3)
add(sfx, click, 22.75, .6); add(sfx, chime, 22.97, .14)
add(sfx, chime, 28.05, .32)
music += .22*np.concatenate([np.zeros(int(.09*SR)), music[:-int(.09*SR)]])
music *= np.clip((DUR-tt)/1.8,0,1)
norm=lambda a,pk: a/(np.abs(a).max()+1e-9)*pk
mix=np.clip(norm(music,.5)+norm(sfx,.62),-.98,.98)
with wave.open(sys.argv[1] if len(sys.argv)>1 else 'lancio.wav','wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    s=(mix*32767).astype('<i2'); w.writeframes(np.column_stack([s,s]).tobytes())
print('audio ok')
