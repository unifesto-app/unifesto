#!/usr/bin/env python3
"""Render the 5.0 launch posts from social.html with headless Chrome.

Each <section class="page"> is one image at its own size. A piece is a set of pages:

  python3 render.py concept            # out/concept/01.png ...
  python3 render.py carousel square    # several pieces; carousel also gets out/carousel.pdf for LinkedIn

Needs: pip install playwright. Drives the installed Google Chrome. Shares the screens and the
Horizon frame with ../store-5.0 (app.js, app.css, frame.css).
"""
import sys, pathlib
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
PDF = {"carousel"}

def main():
    pieces = sys.argv[1:] or ["concept"]
    with sync_playwright() as p:
        browser = p.chromium.launch(channel="chrome")
        for piece in pieces:
            pg = browser.new_page(viewport={"width": 1920, "height": 1920}, device_scale_factor=1)
            errs = []
            pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.goto((HERE / "social.html").as_uri() + f"?piece={piece}")
            pg.wait_for_function("window.ready === true", timeout=20000)
            if errs: sys.exit(f"{piece}: {'; '.join(errs)}")
            out = HERE / "out" / piece
            out.mkdir(parents=True, exist_ok=True)
            pages = pg.locator("section.page")
            for i in range(pages.count()):
                f = out / f"{i + 1:02d}.png"
                pages.nth(i).screenshot(path=str(f), omit_background=True)
                print(f.relative_to(HERE))
            if piece in PDF:
                box = pages.nth(0).bounding_box()
                f = HERE / "out" / f"{piece}.pdf"
                pg.pdf(path=str(f), width=f"{box['width']}px", height=f"{box['height']}px", print_background=True)
                print(f.relative_to(HERE))
            pg.close()
        browser.close()

main()
