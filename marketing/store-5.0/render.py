#!/usr/bin/env python3
"""Render the 5.0.0 store screenshots from screens.html with headless Chrome.

Each <section class="page"> is one screenshot, drawn at the store's exact pixel size:

  iphone   1320x2868  App Store, iPhone 6.9"
  ipad     2064x2752  App Store, iPad 13"
  play     1080x1920  Google Play phone (9:16)
  tab      1440x2560  Google Play 7-inch and 10-inch tablet (9:16)
  feature  1024x500   Google Play feature graphic
  header   3840x1646  App Store product page header (21:9)
  search   3840x2560  App Store search result (3:2)

  python3 render.py                 # every size -> out/<size>/01.png ...
  python3 render.py iphone 3        # one size, only screen 3 (to check an edit)

Needs: pip install playwright. Drives the installed Google Chrome, no Chromium download.
"""
import sys, pathlib
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
SIZES = {"iphone": (1320, 2868), "ipad": (2064, 2752), "play": (1080, 1920), "tab": (1440, 2560), "feature": (1024, 500),
         "header": (3840, 1646), "search": (3840, 2560)}

def main():
    sizes = [a for a in sys.argv[1:] if a in SIZES] or list(SIZES)
    only = next((int(a) for a in sys.argv[1:] if a.isdigit()), None)
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        for size in sizes:
            w, h = SIZES[size]
            pg = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=1)
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto((HERE / "screens.html").as_uri() + f"?size={size}")
            pg.wait_for_function("window.ready === true", timeout=20000)
            if errs: sys.exit(f"{size}: {'; '.join(errs)}")
            out = HERE / "out" / size
            out.mkdir(parents=True, exist_ok=True)
            pages = pg.locator("section.page")
            for i in range(pages.count()):
                if only and i + 1 != only: continue
                f = out / f"{i + 1:02d}.png"
                pages.nth(i).screenshot(path=str(f))
                print(f"{size} {f.relative_to(HERE)}")
            pg.close()
        browser.close()

main()
