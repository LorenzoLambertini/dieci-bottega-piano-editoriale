#!/usr/bin/env python3
"""Rende lancio.html in PNG/MP4. Uso: python3 render.py anteprima t1 t2 ...  |  python3 render.py video out.mp4"""
import sys, os, subprocess
from playwright.sync_api import sync_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
FPS = 30
mode = sys.argv[1]
with sync_playwright() as pw:
    exe = '/opt/pw-browsers/chromium' if os.path.isfile('/opt/pw-browsers/chromium') else None
    b = pw.chromium.launch(executable_path=exe, args=["--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width": 1080, "height": 1920}, device_scale_factor=1)
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + os.path.join(HERE, os.environ.get("PAGINA", "lancio.html"))); pg.wait_for_function("window.pronto===true", timeout=20000)
    if errs: print("ERRORI", errs)
    if mode == "anteprima":
        out = sys.argv[2]
        for t in sys.argv[3:]:
            pg.evaluate(f"render({t},{int(float(t)*FPS)})")
            pg.screenshot(path=f"{out}/t{float(t):05.2f}.png")
    else:
        dur = pg.evaluate("window.DURATA"); n = int(dur * FPS)
        ff = subprocess.Popen(["ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", str(FPS), "-i", "-",
                               "-c:v", "libx264", "-crf", "16", "-preset", "medium", "-pix_fmt", "yuv420p", sys.argv[2]], stdin=subprocess.PIPE)
        for f in range(n):
            pg.evaluate(f"render({f/FPS},{f})")
            ff.stdin.write(pg.screenshot(type="png"))
            if f % 150 == 0: print(f, "/", n, flush=True)
        ff.stdin.close(); ff.wait()
    b.close()
