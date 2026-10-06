"""Unifesto mark, monochrome cosmos edition (Oct 2026).

Same "u" and wordmark as before (vector paths recovered from
websites/web/public/logos/unifesto.svg); only the treatment changes to the
website's theme: silver on black, ink on white, with the hero's horizon.

    python3 build.py      # writes svg/ ; render.sh turns them into PNG/ICO
"""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "../../websites/web/public/logos/unifesto.svg")

# ── recover the original vectors ──────────────────────────────────────────
_s = open(SRC).read()
_mask = re.search(r'<mask id="56baa94f16">(.*?)</mask>', _s, re.S).group(1)
GLYPHS = [(float(x), float(y), d) for x, y, d in
          re.findall(r'<g transform="translate\(([\d.]+), ([\d.]+)\)"><g><path d="([^"]+)"', _mask)]
U = GLYPHS[0][2]                       # the "u": x 2.97..69.03, y -46.08..1.63
U_CX, U_CY, U_W = 36.0, -22.23, 66.06
WM_X0, WM_X1, WM_TOP, WM_BASE = 133.0, 636.0, 177.0, 249.0   # wordmark bounds (glyph space)

SILVER = ('<linearGradient id="{id}" x1="0" y1="0" x2=".6" y2="1">'
          '<stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#e4e4e8"/>'
          '<stop offset="1" stop-color="#a6a6ad"/></linearGradient>')
INK = ('<linearGradient id="{id}" x1="0" y1="0" x2=".6" y2="1">'
       '<stop offset="0" stop-color="#3a3a40"/><stop offset=".45" stop-color="#111113"/>'
       '<stop offset="1" stop-color="#000"/></linearGradient>')

STARS = [(188, 214, 3.2, .75), (836, 176, 2.6, .6), (902, 430, 2.0, .45), (128, 548, 2.0, .4),
         (716, 118, 1.8, .5), (318, 132, 1.6, .4), (612, 236, 1.4, .3), (880, 640, 1.6, .3)]


def u_path(cx, cy, width, fill, rim=None):
    k = width / U_W
    t = f"translate({cx - U_CX * k:.2f},{cy - U_CY * k:.2f}) scale({k:.4f})"
    stroke = f' stroke="{rim}" stroke-width="{2.4 / k:.3f}"' if rim else ""
    return f'<path d="{U}" transform="{t}" fill="{fill}"{stroke}/>'


def scene(theme, u_width=495, u_cy=500, horizon_top=842, stars=True, uid="a"):
    """Full-bleed 1024 artwork: ground, starlight, horizon, the u."""
    dark = theme == "dark"
    R = 1500
    defs = (SILVER if dark else INK).format(id=f"u{uid}")
    defs += (f'<radialGradient id="sky{uid}" cx=".5" cy=".42" r=".7">'
             f'<stop offset="0" stop-color="{"#131316" if dark else "#ffffff"}"/>'
             f'<stop offset="1" stop-color="{"#000" if dark else "#f1f1f3"}"/></radialGradient>'
             f'<radialGradient id="halo{uid}" cx=".5" cy=".5" r=".5">'
             f'<stop offset="0" stop-color="{"#fff" if dark else "#111113"}" stop-opacity="{.13 if dark else .06}"/>'
             f'<stop offset="1" stop-color="{"#fff" if dark else "#111113"}" stop-opacity="0"/></radialGradient>'
             f'<linearGradient id="planet{uid}" x1="0" y1="0" x2="0" y2="1">'
             f'<stop offset="0" stop-color="{"#1c1c20" if dark else "#e6e6ea"}"/>'
             f'<stop offset=".18" stop-color="{"#050506" if dark else "#f7f7f8"}"/></linearGradient>'
             f'<filter id="blur{uid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="26"/></filter>')
    sky = f'<rect width="1024" height="1024" fill="url(#sky{uid})"/>'
    star = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{"#fff" if dark else "#111113"}" opacity="{o * (1 if dark else .45)}"/>'
                   for x, y, r, o in STARS) if stars else ""
    halo = f'<ellipse cx="512" cy="{u_cy + 20}" rx="{u_width * .95:.0f}" ry="{u_width * .8:.0f}" fill="url(#halo{uid})"/>'
    cy = horizon_top + R
    rim_glow = (f'<ellipse cx="512" cy="{horizon_top + 6}" rx="420" ry="34" fill="{"#fff" if dark else "#111113"}" '
                f'opacity="{.16 if dark else .06}" filter="url(#blur{uid})"/>')
    planet = (f'<circle cx="512" cy="{cy}" r="{R}" fill="url(#planet{uid})"/>'
              f'<circle cx="512" cy="{cy}" r="{R}" fill="none" stroke="{"#fff" if dark else "#111113"}" '
              f'stroke-opacity="{.42 if dark else .22}" stroke-width="2.5"/>')
    rim = "rgba(255,255,255,.55)" if dark else None
    mark = u_path(512, u_cy, u_width, f"url(#u{uid})", rim)
    return defs, sky + star + halo + rim_glow + planet + mark


def svg(body, defs="", vb="0 0 1024 1024", size=None):
    wh = f' width="{size}" height="{size}"' if size else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{wh}><defs>{defs}</defs>{body}</svg>'


def app_icon(theme, rounded=False, **kw):
    defs, body = scene(theme, **kw)
    if rounded:  # for previews / web PWA; iOS and Android apply their own masks
        defs += '<clipPath id="sq"><rect width="1024" height="1024" rx="228"/></clipPath>'
        body = f'<g clip-path="url(#sq)">{body}</g>'
    return svg(body, defs)


def wordmark(fill_kind, pad=24):
    """The original wordmark, outlined. fill_kind: silver | ink | white | black."""
    # ink stays solid: the short glyph band turns the ink gradient grey
    defs, fill = "", {"white": "#ffffff", "black": "#111113", "ink": "#111113"}.get(fill_kind)
    if fill is None:
        defs = SILVER.format(id="wm").replace('x2=".6" y2="1"', 'x2="0" y2="1"')
        fill = "url(#wm)"
    paths = "".join(f'<path d="{d}" transform="translate({x},{y})"/>' for x, y, d in GLYPHS)
    vb = f"{WM_X0 - pad} {WM_TOP - pad} {WM_X1 - WM_X0 + 2 * pad} {WM_BASE - WM_TOP + 2 * pad}"
    # gradient spans the whole word, not each letter
    return svg(f'<g fill="{fill}">{paths}</g>', defs.replace("<linearGradient", '<linearGradient gradientUnits="userSpaceOnUse"')
               .replace('x1="0" y1="0" x2="0" y2="1"', f'x1="0" y1="{WM_TOP}" x2="0" y2="{WM_BASE}"'), vb)


def symbol(fill_kind):
    """The u alone on a transparent square, for favicons and avatars."""
    defs, fill = "", {"white": "#ffffff", "black": "#111113"}.get(fill_kind)
    if fill is None:
        defs = (SILVER if fill_kind == "silver" else INK).format(id="s")
        fill = "url(#s)"
    return svg(u_path(512, 512, 760, fill), defs)


# ── "Powered by Unifesto" badges, for organisers' pages, posters, sponsor walls ──
def _label_font():
    """Hanken Grotesk at weight 500, static. Outlined so badges need no font."""
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont
    return instantiateVariableFont(TTFont(os.path.join(HERE, "HankenGrotesk.ttf")), {"wght": 500})


_FONT = None


def label(text, size, x, baseline, fill):
    """Outlined text: returns (svg, width)."""
    global _FONT
    from fontTools.pens.svgPathPen import SVGPathPen
    from fontTools.pens.transformPen import TransformPen
    _FONT = _FONT or _label_font()
    gs, cmap = _FONT.getGlyphSet(), _FONT.getBestCmap()
    k, adv, parts = size / _FONT["head"].unitsPerEm, 0, []
    for ch in text:
        g = gs[cmap[ord(ch)]]
        pen = SVGPathPen(gs)
        g.draw(TransformPen(pen, (k, 0, 0, -k, x + adv, baseline)))
        parts.append(pen.getCommands())
        adv += g.width * k + size * 0.01
    return f'<path d="{" ".join(parts)}" fill="{fill}"/>', adv


def _wm_group(x, baseline, height, fill):
    """The wordmark placed with its baseline at `baseline`, `height` from top of f to baseline."""
    k = height / (WM_BASE - WM_TOP)
    paths = "".join(f'<path d="{d}" transform="translate({gx},{gy})"/>' for gx, gy, d in GLYPHS)
    t = f"translate({x - WM_X0 * k:.2f},{baseline - WM_BASE * k:.2f}) scale({k:.4f})"
    return f'<g transform="{t}" fill="{fill}">{paths}</g>', (WM_X1 - WM_X0) * k


BADGE_THEMES = {
    #        container          border                 label      wordmark
    "dark":  ("#000000", "rgba(255,255,255,.18)", "#8a8a90", "silver"),
    "light": ("#ffffff", "rgba(17,17,19,.14)",    "#63636a", "#111113"),
    "white": (None, None, "#ffffff", "#ffffff"),   # one colour, no container
    "black": (None, None, "#111113", "#111113"),
}


def powered_by(theme, stacked=False):
    bg, border, ink, wm = BADGE_THEMES[theme]
    defs = ""
    if wm == "silver":
        defs = (SILVER.format(id="pb").replace('x2=".6" y2="1"', 'x2="0" y2="1"')
                .replace("<linearGradient", '<linearGradient gradientUnits="userSpaceOnUse"')
                .replace('x1="0" y1="0" x2="0" y2="1"', f'x1="0" y1="{WM_TOP}" x2="0" y2="{WM_BASE}"'))
        wm = "url(#pb)"
    pad = 40
    if not stacked:
        H, base = 128, 82
        txt, tw = label("Powered by", 30, pad, base, ink)
        mark, mw = _wm_group(pad + tw + 22, base, 44, wm)
        W = pad + tw + 22 + mw + pad
    else:
        _, tw = label("Powered by", 28, 0, 0, ink)
        _, mw = _wm_group(0, 0, 58, wm)
        W = max(tw, mw) + 2 * pad + 24
        H = 220
        txt, _ = label("Powered by", 28, (W - tw) / 2, 84, ink)
        mark, _ = _wm_group((W - mw) / 2, 166, 58, wm)
    box = ""
    if bg:
        box = (f'<rect x="1" y="1" width="{W - 2:.1f}" height="{H - 2}" rx="{H * .22:.0f}" fill="{bg}" '
               f'stroke="{border}" stroke-width="2"/>')
    return svg(box + txt + mark, defs, vb=f"0 0 {W:.0f} {H}")


def favicon():
    """Tab icon: black tile + silver u, legible at 16px (no stars/horizon)."""
    defs = SILVER.format(id="f")
    body = ('<rect width="1024" height="1024" rx="220" fill="#000"/>'
            '<rect x="10" y="10" width="1004" height="1004" rx="212" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="20"/>'
            + u_path(512, 520, 680, "url(#f)"))
    return svg(body, defs)


if __name__ == "__main__":
    out = os.path.join(HERE, "svg")
    os.makedirs(out, exist_ok=True)
    files = {
        "app-icon-dark.svg": app_icon("dark"),
        "app-icon-light.svg": app_icon("light"),
        "app-icon-dark-rounded.svg": app_icon("dark", rounded=True),
        "app-icon-light-rounded.svg": app_icon("light", rounded=True),
        # Android adaptive: full-bleed, u shrunk into the 66% safe circle
        "android-foreground.svg": app_icon("dark", u_width=330, u_cy=505, horizon_top=760),
        "android-monochrome.svg": svg(u_path(512, 512, 330, "#ffffff")),
        "favicon.svg": favicon(),
        "symbol-silver.svg": symbol("silver"),
        "symbol-ink.svg": symbol("ink"),
        "symbol-white.svg": symbol("white"),
        "symbol-black.svg": symbol("black"),
        "wordmark-silver.svg": wordmark("silver"),
        "wordmark-ink.svg": wordmark("ink"),
        "wordmark-white.svg": wordmark("white"),
        "wordmark-black.svg": wordmark("black"),
        **{f"powered-by-{t}{'-stacked' if st else ''}.svg": powered_by(t, st)
           for t in BADGE_THEMES for st in (False, True)},
    }
    for name, content in files.items():
        open(os.path.join(out, name), "w").write(content)
    print("\n".join(files))
