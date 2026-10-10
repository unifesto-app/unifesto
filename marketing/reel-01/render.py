#!/usr/bin/env python3
"""Render reel.html to unifesto-reel-01.mp4 (1080x1920, 30 fps, 30 s, H.264 + AAC).

reel.html exposes window.seek(t): every frame is a pure function of time. This script steps through the
900 frames in headless Chromium at 2x, lets ffmpeg scale them down (supersampling), adds a light grain
over the horizon so the dark gradients survive compression, and muxes soundtrack.wav.

Needs:  pip install playwright && playwright install chromium     and ffmpeg on PATH.

  python3 render.py                    # full render -> unifesto-reel-01.mp4 (roughly 10 minutes)
  python3 render.py --frames 210 300   # frames 210..299 only -> preview.mp4, no sound (to check an edit)
  python3 render.py --still 2.3        # one frame at t = 2.3 s -> still-02.300.png (e.g. a new cover)
  python3 render.py --offline DIR      # no internet: take gsap.min.js, CustomEase.min.js, a Michroma font
                                       # file and a Hanken Grotesk font file from DIR instead of the CDNs
"""
import sys, json, base64, pathlib, subprocess, time
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
SCORE = json.loads((HERE / "score.json").read_text())
FPS, DUR, W, H = SCORE["fps"], SCORE["duration"], 1080, 1920

GRADE = ("scale=%d:%d:flags=lanczos+accurate_rnd+full_chroma_int:in_range=full:out_range=tv:out_color_matrix=bt709,format=yuv420p," % (W, H) +
         # grain only where the horizon is (and only where there is light), so black stays black and text stays clean
         "split=3[a][b][c];[b]noise=c0s=4:c0f=t+u[n];"
         "[c]lutyuv=y='if(gt(val,17),255,0)':u=128:v=128,gblur=sigma=8,crop=%d:560:0:1360,pad=%d:%d:0:1360:black,gblur=sigma=40:steps=2[m];" % (W, W, H) +
         "[a][n][m]maskedmerge[v]")
X264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "15", "-profile:v", "high", "-level", "4.1", "-pix_fmt", "yuv420p",
        "-x264-params", "aq-mode=3:keyint=60:min-keyint=30", "-bf", "2",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-movflags", "+faststart"]

def offline_routes(pg, d):
    d = pathlib.Path(d)
    def font(pattern):
        f = next(p for p in sorted(d.iterdir()) if pattern in p.name.lower() and p.suffix in (".woff2", ".ttf", ".otf"))
        kind = {".woff2": "woff2", ".ttf": "truetype", ".otf": "opentype"}[f.suffix]
        return f"url(data:font/{f.suffix[1:]};base64,{base64.b64encode(f.read_bytes()).decode()}) format(\"{kind}\")"
    css = (f'@font-face{{font-family:"Michroma";font-weight:400;src:{font("michroma")}}}'
           f'@font-face{{font-family:"Hanken Grotesk";font-weight:100 900;src:{font("hanken")}}}')
    pg.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(content_type="text/css", body=css))
    pg.route("https://fonts.gstatic.com/**", lambda r: r.abort())
    pg.route("https://cdn.jsdelivr.net/**", lambda r: r.fulfill(content_type="application/javascript", body=(d / r.request.url.rsplit("/", 1)[1]).read_text()))

def main():
    a = sys.argv[1:]
    def opt(name, n):
        if name in a: i = a.index(name); return a[i + 1:i + 1 + n]
    frames, still, offline = opt("--frames", 2), opt("--still", 1), opt("--offline", 1)
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--allow-file-access-from-files", "--disable-lcd-text", "--font-render-hinting=none"])
        pg = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=2).new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        if offline: offline_routes(pg, offline[0])
        pg.goto((HERE / "reel.html").as_uri() + "?render", wait_until="load"); pg.evaluate("window.ready")
        if errs: sys.exit("reel.html failed to start: " + "; ".join(errs))
        cdp = pg.context.new_cdp_session(pg)
        def shot(t):
            pg.evaluate("t => window.seek(t)", t)
            r = cdp.send("Page.captureScreenshot", {"format": "png", "optimizeForSpeed": True, "captureBeyondViewport": False,
                                                    "clip": {"x": 0, "y": 0, "width": W, "height": H, "scale": 2}})
            return base64.b64decode(r["data"])
        if still:
            t = float(still[0]); out = HERE / f"still-{t:06.3f}.png"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "png", "-i", "-",
                            "-vf", f"scale={W}:{H}:flags=lanczos+accurate_rnd+full_chroma_int", "-frames:v", "1", str(out)], input=shot(t), check=True)
            print(out)
        else:
            full = not frames; f0, f1 = (0, round(DUR * FPS)) if full else (int(frames[0]), int(frames[1]))
            out = HERE / ("unifesto-reel-01.mp4" if full else "preview.mp4")
            cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", str(FPS), "-c:v", "png", "-i", "-"]
            if full: cmd += ["-i", str(HERE / "soundtrack.wav")]
            cmd += ["-filter_complex", "[0:v]" + GRADE, "-map", "[v]"] + (["-map", "1:a", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-t", str(DUR)] if full else []) + X264 + [str(out)]
            ff = subprocess.Popen(cmd, stdin=subprocess.PIPE); t0 = time.time()
            for i in range(f0, f1):
                ff.stdin.write(shot(i / FPS))
                if (i - f0) % 60 == 59: print(f"{i + 1 - f0}/{f1 - f0} frames  ({(time.time() - t0) / (i + 1 - f0):.2f} s/frame)", flush=True)
            ff.stdin.close()
            if ff.wait(): sys.exit("ffmpeg failed")
            print(out)
        b.close()

if __name__ == "__main__":
    main()
