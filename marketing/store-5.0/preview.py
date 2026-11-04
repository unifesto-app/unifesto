#!/usr/bin/env python3
"""Render preview.html to out/preview.mp4: the App Store app preview (886x1920, 30 fps, H.264 + AAC).

preview.html exposes window.seek(t); this steps through every frame in headless Chrome, pipes the PNGs
to ffmpeg, and lays the reel-01 brand soundtrack under it with a fade at the end.

  python3 preview.py              # full render -> out/preview.mp4
  python3 preview.py --still 4.2  # one frame -> out/preview-4.20.png (to check a moment, or pick the poster frame)

Needs: pip install playwright, and ffmpeg on PATH.
"""
import sys, pathlib, subprocess
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
FPS, W, H = 30, 886, 1920
SOUND = HERE.parent / "reel-01" / "soundtrack.wav"

def main():
    still = float(sys.argv[sys.argv.index("--still") + 1]) if "--still" in sys.argv else None
    (HERE / "out").mkdir(exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        pg = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        pg.goto((HERE / "preview.html").as_uri())
        pg.wait_for_function("window.ready === true", timeout=20000)
        if still is not None:
            pg.evaluate(f"seek({still})")
            pg.screenshot(path=str(HERE / "out" / f"preview-{still:.2f}.png"))
            return
        dur = pg.evaluate("DURATION")
        frames = round(dur * FPS)
        out = HERE / "out" / "preview.mp4"
        ff = subprocess.Popen([
            "ffmpeg", "-v", "error", "-y", "-f", "image2pipe", "-framerate", str(FPS), "-i", "-",
            "-i", str(SOUND), "-filter:a", f"atrim=0:{dur},afade=t=out:st={dur - 1.5}:d=1.5",
            "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high",
            "-pix_fmt", "yuv420p", "-r", str(FPS), "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2",
            "-movflags", "+faststart", "-t", str(dur), str(out)], stdin=subprocess.PIPE)
        for i in range(frames):
            pg.evaluate(f"seek({i / FPS})")
            ff.stdin.write(pg.screenshot(type="png"))
            if i % 90 == 0: print(f"  {i}/{frames}", flush=True)
        ff.stdin.close()
        if ff.wait(): sys.exit("ffmpeg failed")
        browser.close()
        print(out.relative_to(HERE))

main()
