"""Render svg/ → png/ (and favicon.ico) with headless Chrome. Run after build.py."""
import os
import subprocess
import tempfile
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
for theme in ("dark", "light", "white", "black"):
    JOBS.append((f"powered-by-{theme}.svg", f"powered-by-{theme}.png", 1716, 384, None))
    JOBS.append((f"powered-by-{theme}-stacked.svg", f"powered-by-{theme}-stacked.png", 1527, 660, None))
for kind in ("silver", "ink", "white", "black"):
    JOBS.append((f"wordmark-{kind}.svg", f"wordmark-{kind}-2400.png", 2400, 551, None))


def shot(svg_name, png_name, w, h, bg):
    page = (f'<!doctype html><html><body style="margin:0;background:{bg or "transparent"}">'
            f'<img src="file://{HERE}/svg/{svg_name}" style="display:block;width:{w}px;height:{h}px"></body></html>')
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False) as f:
        f.write(page)
    subprocess.run([CHROME, "--headless=new", "--hide-scrollbars", "--force-device-scale-factor=1",
                    "--default-background-color=00000000", f"--window-size={w},{h}",
                    f"--screenshot={OUT}/{png_name}", f"file://{f.name}"],
                   check=True, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
    os.unlink(f.name)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for job in JOBS:
        shot(*job)
    # opaque icons must not carry an alpha channel (App Store rejects it)
    for name in ("app-icon-dark-1024.png", "app-icon-light-1024.png", "android-foreground-1024.png",
                 "apple-touch-icon-180.png", "social-avatar-1080.png",
                 "linkedin-banner-2256x382.png"):
        p = os.path.join(OUT, name)
        Image.open(p).convert("RGB").save(p)
    Image.open(os.path.join(OUT, "favicon-48.png")).save(
        os.path.join(HERE, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    print(f"{len(JOBS)} PNGs + favicon.ico")
