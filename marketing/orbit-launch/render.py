#!/usr/bin/env python3
"""Render the Unifesto Orbit launch kit: the two video cuts in orbit.html and the stills in stills.html.

  python3 render.py video long  OUT_DIR        # YouTube, 4096x2864 (1.43:1), 30 fps, H.264 + AAC (about an hour on an 8 GB Mac)
  python3 render.py video short OUT_DIR        # Shorts / Reels, 1080x1920, 30 fps
  python3 render.py video long OUT_DIR --frames 300 420   # frames 300..419 only -> preview-long.mp4, no sound
  python3 render.py still long 12.5 OUT.png    # one video frame at t = 12.5 s
  python3 render.py stills OUT_DIR             # every <section class="page" data-name=...> in stills.html -> OUT_DIR/<name>.png

Every frame is a pure function of time (window.seek(t)), so frames are rendered one by one, in one browser, sequentially.
The soundtrack is made first if missing (soundtrack.py, reads cuts.js like the picture does).
Needs: pip install playwright numpy scipy, Google Chrome (or playwright install chromium), ffmpeg on PATH.
"""
import sys, json, base64, pathlib, subprocess, time, re
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
CUTS = json.loads(re.search(r"window\.CUTS = (\{.*\});", (HERE / "cuts.js").read_text(), re.S).group(1))
X264 = ["-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-pix_fmt", "yuv420p", "-bf", "2", "-g", "60",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-movflags", "+faststart"]
# light grain so the dark gradients survive YouTube / Instagram compression
GRADE = "scale={w}:{h}:flags=lanczos+accurate_rnd+full_chroma_int:out_range=tv:out_color_matrix=bt709,noise=c0s=3:c0f=t+u,format=yuv420p"


def browser(p):
    args = ["--allow-file-access-from-files", "--disable-lcd-text", "--font-render-hinting=none"]
    try: return p.chromium.launch(channel="chrome", args=args)
    except Exception: return p.chromium.launch(args=args)


def open_cut(b, cut):
    c = CUTS[cut]
    pg = b.new_context(viewport={"width": c["w"], "height": c["h"]}, device_scale_factor=c["dpr"]).new_page()
    errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto((HERE / "orbit.html").as_uri() + f"?cut={cut}&render", wait_until="load")
    pg.evaluate("window.ready")
    if errs: sys.exit("orbit.html failed: " + "; ".join(errs))
    cdp = pg.context.new_cdp_session(pg)
    def shot(t):
        pg.evaluate("t => window.seek(t)", t)
        r = cdp.send("Page.captureScreenshot", {"format": "png", "optimizeForSpeed": True, "captureBeyondViewport": False})
        return base64.b64decode(r["data"])
    return c, shot, pg.evaluate("window.DUR")


def video(cut, out_dir, frames=None):
    out_dir = pathlib.Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    wav = HERE / f"soundtrack-{cut}.wav"
    if not frames and not wav.exists(): subprocess.run([sys.executable, str(HERE / "soundtrack.py"), cut, str(wav)], check=True)
    with sync_playwright() as p:
        b = browser(p); c, shot, dur = open_cut(b, cut)
        fps = CUTS["fps"]; w, h = c["out"]
        f0, f1 = (0, round(dur * fps)) if not frames else (int(frames[0]), int(frames[1]))
        out = out_dir / (f"unifesto-orbit-{cut}.mp4" if not frames else f"preview-{cut}.mp4")
        cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", str(fps), "-c:v", "png", "-i", "-"]
        if not frames: cmd += ["-i", str(wav)]
        cmd += ["-vf", GRADE.format(w=w, h=h)] + (["-map", "0:v", "-map", "1:a", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-t", str(dur)] if not frames else []) + X264 + [str(out)]
        ff = subprocess.Popen(cmd, stdin=subprocess.PIPE); t0 = time.time()
        for i in range(f0, f1):
            ff.stdin.write(shot(i / fps))
            if (i - f0) % 60 == 59: print(f"{cut}: {i + 1 - f0}/{f1 - f0} frames ({(time.time() - t0) / (i + 1 - f0):.2f} s/frame)", flush=True)
        ff.stdin.close()
        if ff.wait(): sys.exit("ffmpeg failed")
        b.close()
    print(out)


def still(cut, t, out):
    with sync_playwright() as p:
        b = browser(p); c, shot, _ = open_cut(b, cut); w, h = c["out"]
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "png", "-i", "-",
                        "-vf", f"scale={w}:{h}:flags=lanczos+accurate_rnd+full_chroma_int", "-frames:v", "1", str(out)], input=shot(float(t)), check=True)
        b.close()
    print(out)


def stills(out_dir):
    """Each page is screenshotted at 2x and scaled to its exact size (data-out="WxH")."""
    out_dir = pathlib.Path(out_dir); out_dir.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = browser(p)
        pg = b.new_context(viewport={"width": 1600, "height": 1200}, device_scale_factor=2).new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto((HERE / "stills.html").as_uri(), wait_until="load"); pg.evaluate("window.ready")
        if errs: sys.exit("stills.html failed: " + "; ".join(errs))
        pages = pg.locator("section.page")
        for i in range(pages.count()):
            el = pages.nth(i); name, size = el.get_attribute("data-name"), el.get_attribute("data-out")
            png = el.screenshot()
            out = out_dir / f"{name}.png"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "png", "-i", "-",
                            "-vf", f"scale={size.replace('x', ':')}:flags=lanczos+accurate_rnd+full_chroma_int", "-frames:v", "1", str(out)], input=png, check=True)
            print(out)
        b.close()


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["video"]: video(a[1], a[2], a[a.index("--frames") + 1:a.index("--frames") + 3] if "--frames" in a else None)
    elif a[:1] == ["still"]: still(a[1], a[2], a[3])
    elif a[:1] == ["stills"]: stills(a[1])
    else: sys.exit(__doc__)
