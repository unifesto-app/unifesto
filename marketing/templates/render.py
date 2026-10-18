#!/usr/bin/env python3
"""Render content pieces from the templates in this folder.

A piece is a small JSON file: {"template": "carousel", ...the fields that template reads}.
Image paths in it are relative to the JSON file. Output lands next to the JSON:
one page -> <name>.png, several -> <name>/01.png, 02.png ... (carousels also get <name>.pdf for LinkedIn).

  python3 render.py examples/w1/howto-carousel.json            # one piece
  python3 render.py examples/w1/*.json                         # a whole week

Needs: pip install playwright. Uses the installed Google Chrome (no Chromium download);
falls back to Playwright's own Chromium if Chrome is missing (playwright install chromium).
One browser for the whole run, so it stays light on an 8 GB machine.
"""
import sys, json, re, pathlib
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
IMG = re.compile(r"\.(jpe?g|png|webp|gif|svg)$", re.I)
PDF_TEMPLATES = {"carousel"}


def resolve_images(v, base):
    """Turn every image path in the piece into an absolute file:// URI (the template lives elsewhere)."""
    if isinstance(v, dict): return {k: resolve_images(x, base) for k, x in v.items()}
    if isinstance(v, list): return [resolve_images(x, base) for x in v]
    if isinstance(v, str) and IMG.search(v) and "://" not in v:
        p = (base / v).resolve()
        if not p.exists(): sys.exit(f"missing image: {v} (looked in {p})")
        return p.as_uri()
    return v


def render(browser, piece_path):
    piece = json.loads(piece_path.read_text())
    tpl = HERE / f"{piece['template']}.html"
    if not tpl.exists(): sys.exit(f"{piece_path}: no template {tpl.name}")
    data = resolve_images(piece, piece_path.parent)

    pg = browser.new_page(viewport={"width": 1920, "height": 1920}, device_scale_factor=1)
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.add_init_script(f"window.DATA = {json.dumps(data)};")
    pg.goto(tpl.as_uri())
    pg.wait_for_function("window.ready === true", timeout=20000)
    if errs: sys.exit(f"{piece_path}: {'; '.join(errs)}")
    for w in pg.evaluate("Kit.warnings"): print(f"  warning: {w}")

    pages = pg.locator("section.page")
    n = pages.count()
    out = []
    if n == 1:
        out.append(piece_path.with_suffix(".png"))
        pages.first.screenshot(path=out[0], omit_background=True)
    else:
        d = piece_path.with_suffix("")
        d.mkdir(exist_ok=True)
        for old in d.glob("[0-9][0-9].png"): old.unlink()
        for i in range(n):
            out.append(d / f"{i + 1:02d}.png")
            pages.nth(i).screenshot(path=out[-1], omit_background=True)
    if piece["template"] in PDF_TEMPLATES:
        box = pages.first.bounding_box()
        out.append(piece_path.with_suffix(".pdf"))
        pg.pdf(path=out[-1], width=f"{box['width']}px", height=f"{box['height']}px", print_background=True)
    pg.close()
    for o in out: print(o.relative_to(pathlib.Path.cwd()) if o.is_relative_to(pathlib.Path.cwd()) else o)


def main():
    pieces = [pathlib.Path(a).resolve() for a in sys.argv[1:]]
    if not pieces: sys.exit(__doc__)
    with sync_playwright() as p:
        try: b = p.chromium.launch(channel="chrome")
        except Exception: b = p.chromium.launch()
        for piece in pieces: render(b, piece)
        b.close()


if __name__ == "__main__":
    main()
