"""Render svg/ → png/ (and favicon.ico) with headless Chrome. Run after build.py.
`python3 render.py docs` renders the guidelines PDF and brand sheet instead."""
import os
import random
import re
import subprocess
import tempfile
import time
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT = os.path.join(HERE, "png")

# (svg, output png, width, height, opaque background or None for transparent)
JOBS = [
    ("app-icon-dark.svg", "app-icon-dark-1024.png", 1024, 1024, "#000"),
    ("app-icon-light.svg", "app-icon-light-1024.png", 1024, 1024, "#fff"),
    ("app-icon-dark-rounded.svg", "app-icon-dark-rounded-1024.png", 1024, 1024, None),
    ("app-icon-light-rounded.svg", "app-icon-light-rounded-1024.png", 1024, 1024, None),
    ("android-foreground.svg", "android-foreground-1024.png", 1024, 1024, "#000"),
    ("android-monochrome.svg", "android-monochrome-1024.png", 1024, 1024, None),
    ("app-icon-dark.svg", "apple-touch-icon-180.png", 180, 180, "#000"),
    ("favicon.svg", "favicon-1024.png", 1024, 1024, None),
    ("favicon.svg", "favicon-512.png", 512, 512, None),
    ("favicon.svg", "favicon-48.png", 48, 48, None),
    ("favicon.svg", "favicon-32.png", 32, 32, None),
    ("favicon.svg", "favicon-16.png", 16, 16, None),
    ("app-icon-dark.svg", "social-avatar-1080.png", 1080, 1080, "#000"),
    ("linkedin-banner.svg", "linkedin-banner-2256x382.png", 2256, 382, "#000"),
    ("symbol-silver.svg", "symbol-silver-1024.png", 1024, 1024, None),
    ("symbol-ink.svg", "symbol-ink-1024.png", 1024, 1024, None),
    ("symbol-white.svg", "symbol-white-1024.png", 1024, 1024, None),
    ("symbol-black.svg", "symbol-black-1024.png", 1024, 1024, None),
]
# Alternate app icons: iOS 1024, Android adaptive foreground 1024, in-app preview 180.
for n in ("night", "day", "aurora", "nebula", "ember", "ocean", "mono"):
    bg = "#fff" if n == "day" else "#000"
    JOBS.append((f"alt-icon-{n}.svg", f"alt-icon-{n}-1024.png", 1024, 1024, bg))
    JOBS.append((f"alt-icon-{n}-android.svg", f"alt-icon-{n}-android-1024.png", 1024, 1024, bg))
    JOBS.append((f"alt-icon-{n}.svg", f"alt-icon-{n}-180.png", 180, 180, bg))
for theme in ("dark", "light", "white", "black"):
    JOBS.append((f"powered-by-{theme}.svg", f"powered-by-{theme}.png", 1716, 384, None))
    JOBS.append((f"powered-by-{theme}-stacked.svg", f"powered-by-{theme}-stacked.png", 1527, 660, None))
for p in ("huddle", "sprint"):
    for layout in ("header", "signoff", "light"):
        JOBS.append((f"poster-{p}-{layout}.svg", f"poster-{p}-{layout}.png", 1080, 1350, None))
for k in ("photo", "colour", "light", "stacked"):
    JOBS.append((f"poster-powered-by-{k}.svg", f"poster-powered-by-{k}.png", 1080, 1350, None))
for kind in ("silver", "ink", "white", "black"):
    JOBS.append((f"wordmark-{kind}.svg", f"wordmark-{kind}-2400.png", 2400, 551, None))
    for p in ("stay", "huddle", "sprint", "orbit"):  # height 400; width keeps each lockup's own ratio
        vb = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', open(os.path.join(HERE, "svg", f"lockup-{p}-{kind}.svg")).read())
        JOBS.append((f"lockup-{p}-{kind}.svg", f"lockup-{p}-{kind}.png", round(400 * float(vb[1]) / float(vb[2])), 400, None))


def shot(svg_name, png_name, w, h, bg):
    page = (f'<!doctype html><html><body style="margin:0;background:{bg or "transparent"}">'
            f'<img src="file://{HERE}/svg/{svg_name}" style="display:block;width:{w}px;height:{h}px"></body></html>')
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(page)
    cmd = [CHROME, "--headless=new", "--hide-scrollbars", "--force-device-scale-factor=1",
           "--default-background-color=00000000", f"--window-size={w},{h}",
           f"--screenshot={OUT}/{png_name}", f"file://{f.name}"]
    # Back-to-back headless launches sometimes exit 2 while the last one shuts down.
    for attempt in range(4):
        if subprocess.run(cmd, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL).returncode == 0:
            break
        time.sleep(1 + attempt)
    else:
        raise RuntimeError(f"Chrome failed to render {svg_name}")
    os.unlink(f.name)


def docs():
    """Grain tiles, the Horizon sky backgrounds, then the guidelines PDF and brand sheet."""
    rnd = random.Random(7)  # fixed seed: re-renders don't churn the files
    # Page grain: white specks by night, ink by day (a CSS invert would print as a full-page raster).
    alpha = [max(0, min(255, int(rnd.gauss(70, 30)))) for _ in range(180 * 180)]
    for name, rgb in (("grain-180.png", (255, 255, 255)), ("grain-180-ink.png", (17, 17, 19))):
        grain = Image.new("RGBA", (180, 180))
        grain.putdata([(*rgb, a) for a in alpha])
        grain.save(os.path.join(OUT, name))
    noise = Image.new("L", (128, 128))  # shade-card grain, blended with overlay
    noise.putdata([max(0, min(255, int(rnd.gauss(128, 42)))) for _ in range(128 * 128)])
    noise.save(os.path.join(OUT, "noise-128.png"))

    base = [CHROME, "--headless=new", "--hide-scrollbars", "--force-device-scale-factor=1", "--virtual-time-budget=12000"]
    for theme, frag in (("night", ""), ("day", "#day")):
        png = os.path.join(OUT, f"horizon-sky-{theme}.png")
        subprocess.run(base + ["--window-size=1920,1080", f"--screenshot={png}", f"file://{HERE}/horizon-sky.html{frag}"],
                       stderr=subprocess.DEVNULL, check=True)
        Image.open(png).convert("RGB").save(os.path.join(OUT, f"horizon-sky-{theme}-1920x1080.jpg"), quality=90)
        os.unlink(png)
    subprocess.run(base + ["--no-pdf-header-footer", f"--print-to-pdf={HERE}/Unifesto-Brand-Guidelines.pdf",
                           f"file://{HERE}/guidelines.html"], stderr=subprocess.DEVNULL, check=True)
    subprocess.run(base + ["--window-size=1600,1180", f"--screenshot={HERE}/brand-sheet.png", f"file://{HERE}/sheet.html"],
                   stderr=subprocess.DEVNULL, check=True)
    print("grain tiles, horizon-sky night/day, Unifesto-Brand-Guidelines.pdf, brand-sheet.png")


if __name__ == "__main__":
    import sys
    os.makedirs(OUT, exist_ok=True)
    # `python3 render.py docs` re-renders only the guidelines PDF, brand sheet and their images.
    if sys.argv[1:] == ["docs"]:
        docs()
        sys.exit()
    # `python3 render.py alt-icon` re-renders only jobs whose svg starts with that prefix.
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    jobs = [j for j in JOBS if j[0].startswith(only)]
    for job in jobs:
        shot(*job)
    # opaque icons must not carry an alpha channel (App Store rejects it)
    opaque = {"app-icon-dark-1024.png", "app-icon-light-1024.png", "android-foreground-1024.png",
              "apple-touch-icon-180.png", "social-avatar-1080.png", "linkedin-banner-2256x382.png"}
    opaque |= {j[1] for j in JOBS if j[0].startswith("alt-icon-")}
    for name in opaque & {j[1] for j in jobs}:
        p = os.path.join(OUT, name)
        Image.open(p).convert("RGB").save(p)
    # The in-app picker's "Auto" (iOS: Day in light mode, Night in dark): the two previews split diagonally.
    if {"alt-icon-day-180.png", "alt-icon-night-180.png"} & {j[1] for j in jobs}:
        day = Image.open(os.path.join(OUT, "alt-icon-day-180.png")).convert("RGB")
        night = Image.open(os.path.join(OUT, "alt-icon-night-180.png")).convert("RGB")
        mask = Image.new("L", day.size)
        mask.putdata([255 if x + y < day.width else 0 for y in range(day.height) for x in range(day.width)])
        Image.composite(day, night, mask).save(os.path.join(OUT, "alt-icon-auto-180.png"))
    Image.open(os.path.join(OUT, "favicon-48.png")).save(
        os.path.join(HERE, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"{len(jobs)} PNGs + favicon.ico")
