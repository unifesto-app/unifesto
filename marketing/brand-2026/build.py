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


# Alternate app-icon colourways: the night scene lit by one nebula colour
# (the same idea as the app's banner-lit pages). (sky core, nebula, rim light)
HUES = {
    "aurora": ("#06241f", "#2dd4bf", "#99f6e4"),
    "nebula": ("#170d2b", "#8b5cf6", "#c4b5fd"),
    "ember": ("#2a1005", "#f97316", "#fdba74"),
    "ocean": ("#07152e", "#3b82f6", "#93c5fd"),
}


def scene(theme, u_width=495, u_cy=500, horizon_top=842, stars=True, uid="a", hue=None):
    """Full-bleed 1024 artwork: ground, starlight, horizon, the u.
    `hue` (a HUES key, dark only) tints the sky core, halo and horizon light."""
    dark = theme == "dark"
    core, glow, rim_light = HUES[hue] if hue else ("#131316", "#fff", "#fff")
    R = 1500
    defs = (SILVER if dark else INK).format(id=f"u{uid}")
    defs += (f'<radialGradient id="sky{uid}" cx=".5" cy=".42" r=".7">'
             f'<stop offset="0" stop-color="{core if dark else "#ffffff"}"/>'
             f'<stop offset="1" stop-color="{"#000" if dark else "#f1f1f3"}"/></radialGradient>'
             f'<radialGradient id="halo{uid}" cx=".5" cy=".5" r=".5">'
             f'<stop offset="0" stop-color="{glow if dark else "#111113"}" stop-opacity="{(.34 if hue else .13) if dark else .06}"/>'
             f'<stop offset="1" stop-color="{glow if dark else "#111113"}" stop-opacity="0"/></radialGradient>'
             f'<linearGradient id="planet{uid}" x1="0" y1="0" x2="0" y2="1">'
             f'<stop offset="0" stop-color="{"#1c1c20" if dark else "#e6e6ea"}"/>'
             f'<stop offset=".18" stop-color="{"#050506" if dark else "#f7f7f8"}"/></linearGradient>'
             f'<filter id="blur{uid}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="26"/></filter>')
    sky = f'<rect width="1024" height="1024" fill="url(#sky{uid})"/>'
    star = "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{"#fff" if dark else "#111113"}" opacity="{o * (1 if dark else .45)}"/>'
                   for x, y, r, o in STARS) if stars else ""
    halo = f'<ellipse cx="512" cy="{u_cy + 20}" rx="{u_width * .95:.0f}" ry="{u_width * .8:.0f}" fill="url(#halo{uid})"/>'
    cy = horizon_top + R
    rim_glow = (f'<ellipse cx="512" cy="{horizon_top + 6}" rx="420" ry="34" fill="{rim_light if dark else "#111113"}" '
                f'opacity="{(.3 if hue else .16) if dark else .06}" filter="url(#blur{uid})"/>')
    planet = (f'<circle cx="512" cy="{cy}" r="{R}" fill="url(#planet{uid})"/>'
              f'<circle cx="512" cy="{cy}" r="{R}" fill="none" stroke="{rim_light if dark else "#111113"}" '
              f'stroke-opacity="{(.6 if hue else .42) if dark else .22}" stroke-width="2.5"/>')
    rim = "rgba(255,255,255,.55)" if dark else None
    mark = u_path(512, u_cy, u_width, f"url(#u{uid})", rim)
    return defs, sky + star + halo + rim_glow + planet + mark


def svg(body, defs="", vb="0 0 1024 1024", size=None):
    wh = f' width="{size}" height="{size}"' if size else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}"{wh}><defs>{defs}</defs>{body}</svg>'


GRAIN = ('<filter id="grain{uid}" x="0" y="0" width="100%" height="100%">'
         '<feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" stitchTiles="stitch"/>'
         '<feColorMatrix values="0 0 0 0 {c} 0 0 0 0 {c} 0 0 0 0 {c} 0 0 0 .6 0"/></filter>')


def horizon_scene(theme, u_width=470, u_cy=512, uid="a"):
    """Unifesto Horizon app icon (approved 29 Oct 2026): the u centred on night
    (starlight and the Horizon-blue glow rising from the bottom-right) or on
    paper (ink u, pale-blue glow, no stars). No lines at all: no horizon, no
    orbits, no planet."""
    dark = theme == "dark"
    glow, glow_a = ("77,141,255", .5) if dark else ("143,180,255", .7)
    defs = ((SILVER if dark else INK).format(id=f"u{uid}")
            + f'<radialGradient id="sun{uid}"><stop offset="0" stop-color="rgb({glow})" stop-opacity="{glow_a}"/>'
            f'<stop offset=".5" stop-color="rgb({glow})" stop-opacity="{glow_a * .45:.3f}"/>'
            f'<stop offset="1" stop-color="rgb({glow})" stop-opacity="0"/></radialGradient>'
            + GRAIN.format(uid=uid, c=1 if dark else 0))
    stars = "".join(f'<circle cx="{x}" cy="{y}" r="{r * .9:.1f}" fill="#fff" opacity="{o * .9:.2f}"/>'
                    for x, y, r, o in STARS[:6]) if dark else ""
    body = (f'<rect width="1024" height="1024" fill="{"#000" if dark else "#f2f2f5"}"/>'
            f'<ellipse cx="880" cy="1010" rx="760" ry="360" fill="url(#sun{uid})"/>' + stars
            + u_path(512, u_cy, u_width, f"url(#u{uid})", "rgba(255,255,255,.5)" if dark else None)
            + f'<rect width="1024" height="1024" filter="url(#grain{uid})" opacity="{.12 if dark else .08}"/>')
    return defs, body


def app_icon(theme, rounded=False, hue=None, **kw):
    # The main Night and Day icons are the Horizon scene; the hued alternates
    # (Aurora, Nebula, Ember, Ocean) keep the older planet scene for now.
    defs, body = scene(theme, hue=hue, **kw) if hue else horizon_scene(theme, **kw)
    if rounded:  # for previews / web PWA; iOS and Android apply their own masks
        defs += '<clipPath id="sq"><rect width="1024" height="1024" rx="228"/></clipPath>'
        body = f'<g clip-path="url(#sq)">{body}</g>'
    return svg(body, defs)


def mono_icon(u_width=495, u_cy=500):
    """Alternate icon: no sky, no horizon, just a flat white u on black."""
    return svg(f'<rect width="1024" height="1024" fill="#000"/>' + u_path(512, u_cy, u_width, "#ffffff"))


# Alternate app icons (expo-alternate-app-icons). name → (iOS 1024 svg, Android foreground svg)
ALT_ICONS = {
    "night": (lambda: app_icon("dark"), lambda: app_icon("dark", u_width=330)),
    "day": (lambda: app_icon("light"), lambda: app_icon("light", u_width=330)),
    **{h: ((lambda h=h: app_icon("dark", hue=h)),
           (lambda h=h: app_icon("dark", hue=h, u_width=330, u_cy=505, horizon_top=760))) for h in HUES},
    "mono": (lambda: mono_icon(), lambda: mono_icon(u_width=330, u_cy=512)),
}


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


# ── Product lockups: the wordmark + product name, one colour family ──
PRODUCTS = ("Stay", "Huddle", "Sprint", "Orbit")
LOCKUP_FILLS = {"silver": None, "ink": "#111113", "white": "#ffffff", "black": "#111113"}


def _silver_band(id, y0, y1):
    """Vertical silver gradient pinned to a y-band, so it runs across a whole lockup."""
    return (f'<linearGradient id="{id}" gradientUnits="userSpaceOnUse" x1="0" y1="{y0:.1f}" x2="0" y2="{y1:.1f}">'
            '<stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#e4e4e8"/>'
            '<stop offset="1" stop-color="#a6a6ad"/></linearGradient>')


def _lockup_group(product, x, base, h, fill):
    """unifesto + product name on one baseline; returns (svg, width). h = wordmark height."""
    mark, mw = _wm_group(x, base, h, fill)
    txt, tw = label(product, h * 76 / 72, x + mw + h * 26 / 72, base, fill)
    return mark + txt, mw + h * 26 / 72 + tw


def lockup(product, fill_kind):
    """The product lockup on its own; the name is set in the badge font."""
    pad, h, base = 24, 72, 96
    defs, fill = "", LOCKUP_FILLS[fill_kind]
    if fill is None:
        defs, fill = _silver_band("lk", base - h, base), "url(#lk)"
    body, w = _lockup_group(product, pad, base, h, fill)
    # wordmark has no descenders; leave room for "y"/"p" in the product name
    return svg(body, defs, vb=f"0 0 {w + 2 * pad:.0f} {base + pad + 18}")


# ── Usage examples: the lockups on 1080x1350 posters (sample content) ──
PW, PH = 1080, 1350


def _text(t, size, x, base, fill, anchor="start"):
    if anchor != "start":
        _, w = label(t, size, 0, 0, fill)
        x -= w / 2 if anchor == "middle" else w
    return label(t, size, x, base, fill)[0]


def _ground(dark):
    """Poster ground: black sky with the horizon, or plain paper."""
    if not dark:
        return '<rect width="1080" height="1350" fill="#f4f4f6"/>'
    R, hz = 2400, 1130
    return ('<radialGradient id="psky" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="#141417"/>'
            '<stop offset="1" stop-color="#000"/></radialGradient>'
            '<rect width="1080" height="1350" fill="url(#psky)"/>'
            + "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" opacity="{o}"/>' for x, y, r, o in
                      [(140, 260, 2.4, .6), (930, 190, 2, .5), (860, 520, 1.6, .35), (210, 700, 1.4, .3), (700, 90, 1.6, .4)])
            + f'<circle cx="540" cy="{hz + R}" r="{R}" fill="#050506" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>')


def _logo_slot(x, y, w, h, dark):
    """Dashed placeholder where the organiser's own logo goes."""
    c = "#ffffff" if dark else "#111113"
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="none" stroke="{c}" '
            f'stroke-opacity=".4" stroke-width="2" stroke-dasharray="10 8"/>'
            + _text("Your logo", 26, x + w / 2, y + h / 2 + 9, "#8a8a90", "middle"))


def poster(product, layout):
    dark = layout != "light"
    fg, muted = ("url(#pt)", "#8a8a90") if dark else ("#111113", "#63636a")
    lk_fill = "url(#plk)" if dark else "#111113"
    defs, body = "", _ground(dark)

    def lk(x, base, h, anchor="start"):
        nonlocal defs
        if dark:
            defs += _silver_band("plk", base - h, base)
        if anchor == "middle":
            x -= _lockup_group(product, 0, 0, h, lk_fill)[1] / 2
        return _lockup_group(product, x, base, h, lk_fill)[0]

    if dark:
        defs += SILVER.format(id="pt").replace('x2=".6" y2="1"', 'x2="0" y2="1"')
    L = 90
    if product == "Huddle" and layout == "header":      # lockup as the masthead
        body += lk(L, 150, 40)
        body += _text("Live session", 30, L, 470, muted)
        body += _text("Design systems", 104, L, 600, fg) + _text("that scale", 104, L, 720, fg)
        body += _text("with Aarav Mehta, Product Designer", 34, L, 800, muted)
        body += _text("Sat 18 Oct · 7:00 PM IST", 36, L, 1010, fg) + _text("Online · 60 min", 30, L, 1060, muted)
    elif product == "Huddle" and layout == "signoff":   # content first, lockup as the sign-off
        body += _text("Sat 18 Oct · 7:00 PM IST", 32, PW / 2, 200, muted, "middle")
        body += _text("Pitching to", 110, PW / 2, 520, fg, "middle") + _text("your first", 110, PW / 2, 645, fg, "middle")
        body += _text("investor", 110, PW / 2, 770, fg, "middle")
        body += _text("with Riya Sen, Founder", 34, PW / 2, 860, muted, "middle")
        body += _text("Join live on", 26, PW / 2, 1205, muted, "middle") + lk(PW / 2, 1270, 34, "middle")
    elif product == "Huddle":                            # light: ink lockup, top centre
        body += lk(PW / 2, 170, 40, "middle")
        body += f'<line x1="{L}" y1="250" x2="{PW - L}" y2="250" stroke="#111113" stroke-opacity=".12" stroke-width="2"/>'
        body += _text("Workshop", 30, PW / 2, 470, muted, "middle")
        body += _text("Shooting on", 110, PW / 2, 600, fg, "middle") + _text("your phone", 110, PW / 2, 725, fg, "middle")
        body += _text("with Kabir Rao, Filmmaker", 34, PW / 2, 815, muted, "middle")
        body += _text("Sun 26 Oct · 11:00 AM IST · Online", 32, PW / 2, 1190, fg, "middle")
    elif layout == "header":                             # Sprint as the headline
        body += _text("Hackathon", 30, PW / 2, 260, muted, "middle")
        body += lk(PW / 2, 400, 86, "middle")
        body += _text("Build Night 2026", 70, PW / 2, 560, fg, "middle")
        body += _text("36 hours · 12–13 Dec · Hyderabad", 34, PW / 2, 650, muted, "middle")
        body += _text("Teams of 2–4 · Mentors · Prizes", 32, PW / 2, 1020, fg, "middle")
    elif layout == "signoff":                            # co-branded with the host
        body += _logo_slot(L, 100, 260, 100, True)
        body += _text("×", 40, L + 310, 164, muted, "middle")
        body += lk(L + 360, 168, 38)
        body += _text("Hack the", 120, L, 560, fg) + _text("campus", 120, L, 690, fg)
        body += _text("24 hours to build what your college needs.", 32, L, 780, muted)
        body += _text("Fri 21 Nov · 9:00 AM", 36, L, 1010, fg) + _text("Main auditorium", 30, L, 1060, muted)
    else:                                                # light: lockup in the footer strip
        body += _text("Open innovation challenge", 30, L, 200, muted)
        body += _text("Climate", 130, L, 420, fg) + _text("Code Sprint", 130, L, 560, fg)
        body += _text("48 hours · 6–7 Dec · Bengaluru", 34, L, 660, muted)
        body += f'<rect x="0" y="1110" width="{PW}" height="240" fill="#ffffff"/>'
        body += '<line x1="0" y1="1110" x2="1080" y2="1110" stroke="#111113" stroke-opacity=".12" stroke-width="2"/>'
        body += _text("Registrations on", 24, L, 1200, muted) + lk(L, 1262, 36)
        body += _logo_slot(PW - L - 220, 1170, 220, 100, False)
    return svg(body, defs, vb=f"0 0 {PW} {PH}")


POSTERS = [(p, l) for p in ("Huddle", "Sprint") for l in ("header", "signoff", "light")]


def _badge(theme, stacked, x, y, w):
    """A Powered by badge nested at (x, y), `w` wide."""
    b = powered_by(theme, stacked)
    vb = re.search(r'viewBox="([^"]+)"', b)[1]
    _, _, vw, vh = map(float, vb.split())
    return f'<svg x="{x:.0f}" y="{y:.0f}" width="{w}" height="{w * vh / vw:.1f}" viewBox="{vb}">{b[b.index(">") + 1:-6]}</svg>'


def organiser_poster(kind):
    """An organiser's own poster (their colours, sample content) carrying the badge."""
    L, C = 90, PW / 2
    if kind == "photo":        # busy image: boxed dark badge, bottom-right corner
        body = ('<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="90"/></filter>'
                '<rect width="1080" height="1350" fill="#120a2a"/>'
                '<circle cx="260" cy="380" r="330" fill="#e0399a" opacity=".75" filter="url(#soft)"/>'
                '<circle cx="840" cy="620" r="360" fill="#ff8a3d" opacity=".6" filter="url(#soft)"/>'
                '<circle cx="480" cy="1050" r="300" fill="#4b3cff" opacity=".7" filter="url(#soft)"/>')
        body += _text("Live music · Open air", 32, L, 200, "#ffffff")
        body += _text("Neon", 190, L, 520, "#ffffff") + _text("Nights", 190, L, 700, "#ffffff")
        body += _text("Sat 15 Nov · 6 PM onwards · Gachibowli", 34, L, 800, "#ffffff")
        body += _badge("dark", False, PW - L - 360, PH - L - 81, 360)
    elif kind == "colour":     # plain brand colour: one-colour white badge in the footer
        body = '<rect width="1080" height="1350" fill="#3c5a8c"/>'
        body += _text("Monthly meetup", 32, C, 300, "#c9d6ee", "middle")
        body += _text("Founders", 140, C, 520, "#ffffff", "middle") + _text("& Friends", 140, C, 670, "#ffffff", "middle")
        body += _text("Thu 30 Oct · 7 PM · HITEC City", 34, C, 780, "#ffffff", "middle")
        body += '<line x1="90" y1="1150" x2="990" y2="1150" stroke="#ffffff" stroke-opacity=".25" stroke-width="2"/>'
        body += _badge("white", False, C - 170, 1190, 340)
    elif kind == "light":      # light colour: one-colour black badge beside sponsors
        body = '<rect width="1080" height="1350" fill="#f8d478"/>'
        body += _text("Campus", 170, L, 380, "#111113") + _text("Food Fest", 170, L, 560, "#111113")
        body += _text("40 stalls · Live cooking · 22–23 Nov", 36, L, 660, "#3a3320")
        body += _text("Supported by", 24, L, 1120, "#3a3320")
        for i in range(3):
            body += (f'<rect x="{L + i * 200}" y="1145" width="170" height="90" rx="12" fill="none" stroke="#111113" '
                     f'stroke-opacity=".35" stroke-width="2" stroke-dasharray="10 8"/>')
        body += _badge("black", True, PW - L - 230, 1110, 230)
    else:                      # square-ish space: stacked light badge, top-right
        body = ('<linearGradient id="pale" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9eef7"/>'
                '<stop offset="1" stop-color="#c7d3ea"/></linearGradient><rect width="1080" height="1350" fill="url(#pale)"/>')
        body += _badge("light", True, PW - L - 260, L, 260)
        body += _text("Department of CSE", 30, L, 520, "#3a4560")
        body += _text("Annual Tech", 130, L, 680, "#111113") + _text("Symposium", 130, L, 820, "#111113")
        body += _text("Talks · Workshops · Project expo", 34, L, 920, "#3a4560")
        body += _text("5 Dec · Main Block", 40, L, 1220, "#111113")
    return svg(body, vb=f"0 0 {PW} {PH}")


ORGANISER_POSTERS = ("photo", "colour", "light", "stacked")


def favicon():
    """Tab icon: black tile + silver u, legible at 16px (no stars/horizon)."""
    defs = SILVER.format(id="f")
    body = ('<rect width="1024" height="1024" rx="220" fill="#000"/>'
            '<rect x="10" y="10" width="1004" height="1004" rx="212" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="20"/>'
            + u_path(512, 520, 680, "url(#f)"))
    return svg(body, defs)


def linkedin_banner():
    """1128x191 LinkedIn cover: the app icon's sky + horizon, stretched wide. Content stays
    centred: LinkedIn's logo covers the bottom-left and mobile crops the sides."""
    W, H, R = 1128, 191, 2600
    hz = 150                                         # horizon top at the centre
    defs = (SILVER.format(id="b").replace('x2=".6" y2="1"', 'x2="0" y2="1"')
            .replace("<linearGradient", '<linearGradient gradientUnits="userSpaceOnUse"')
            .replace('x1="0" y1="0" x2="0" y2="1"', 'x1="0" y1="52" x2="0" y2="100"')
            + '<radialGradient id="skyb" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#16161a"/>'
              '<stop offset="1" stop-color="#000"/></radialGradient>'
              '<linearGradient id="planetb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1c20"/>'
              '<stop offset=".02" stop-color="#050506"/></linearGradient>'
              '<filter id="blurb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>')
    stars = [(96, 38, 1.6, .7), (214, 112, 1.2, .45), (330, 30, 1.0, .4), (402, 128, 1.3, .35),
             (742, 26, 1.2, .5), (812, 118, 1.0, .35), (918, 44, 1.6, .65), (1036, 96, 1.2, .45),
             (1088, 30, 1.0, .4), (160, 66, 0.9, .3), (980, 140, 0.9, .3), (612, 18, 0.9, .3)]
    body = (f'<rect width="{W}" height="{H}" fill="url(#skyb)"/>'
            + "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" opacity="{o}"/>' for x, y, r, o in stars)
            + f'<ellipse cx="564" cy="{hz + 4}" rx="460" ry="16" fill="#fff" opacity=".14" filter="url(#blurb)"/>'
            + f'<circle cx="564" cy="{hz + R}" r="{R}" fill="url(#planetb)"/>'
            + f'<circle cx="564" cy="{hz + R}" r="{R}" fill="none" stroke="#fff" stroke-opacity=".4" stroke-width="1.2"/>')
    mark, mw = _wm_group(0, 0, 48, "url(#b)")
    mark, _ = _wm_group((W - mw) / 2, 100, 48, "url(#b)")
    _, tw = label("Optimize. Organize. Elevate.", 15, 0, 0, "#8a8a90")
    tag, _ = label("Optimize. Organize. Elevate.", 15, (W - tw) / 2, 130, "#8a8a90")
    return svg(body + mark + tag, defs, vb=f"0 0 {W} {H}")


if __name__ == "__main__":
    out = os.path.join(HERE, "svg")
    os.makedirs(out, exist_ok=True)
    files = {
        "app-icon-dark.svg": app_icon("dark"),
        "app-icon-light.svg": app_icon("light"),
        "app-icon-dark-rounded.svg": app_icon("dark", rounded=True),
        "app-icon-light-rounded.svg": app_icon("light", rounded=True),
        # Android adaptive: full-bleed, u shrunk into the 66% safe circle
        "android-foreground.svg": app_icon("dark", u_width=330),
        "android-monochrome.svg": svg(u_path(512, 512, 330, "#ffffff")),
        "favicon.svg": favicon(),
        "linkedin-banner.svg": linkedin_banner(),
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
        **{f"lockup-{p.lower()}-{c}.svg": lockup(p, c) for p in PRODUCTS for c in LOCKUP_FILLS},
        **{f"poster-{p.lower()}-{l}.svg": poster(p, l) for p, l in POSTERS},
        **{f"poster-powered-by-{k}.svg": organiser_poster(k) for k in ORGANISER_POSTERS},
        **{f"alt-icon-{n}.svg": ios() for n, (ios, _) in ALT_ICONS.items()},
        **{f"alt-icon-{n}-android.svg": fg() for n, (_, fg) in ALT_ICONS.items()},
    }
    for name, content in files.items():
        open(os.path.join(out, name), "w").write(content)
    print("\n".join(files))
