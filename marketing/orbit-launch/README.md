# Unifesto Orbit launch kit

Source for the Orbit launch videos and stills. Rendered media is not committed: render it into a folder outside the repo.

| File | What it is |
|---|---|
| `orbit.html` | The animation. `?cut=long` (YouTube, 1536x1074 css at dpr 8/3 = 4096x2864, 1.43:1) or `?cut=short` (Shorts / Reels, 1080x1920). Every frame is a pure function of time: `window.seek(t)`. Open it in a browser to preview with sound. |
| `cuts.js` | Scene list and length of each cut, the kick range. Picture and sound both read it (120 BPM, a bar is 2 s). |
| `stills.html` | YouTube thumbnail (4096x2864), Instagram carousel (5 x 1080x1350), Instagram Story (1080x1920) and its link-sticker guide. |
| `kit.css`, `kit.js` | Shared look and pieces: sky and planet horizon, Orbit badge, Orbit Lead ID card, campus orbit system, stops, tiers, certificate. Ported from `websites/web/src/components/visuals/Orbit.tsx`. |
| `india.js` | India outline copied from `websites/web/src/components/visuals/india-outline.ts`. |
| `soundtrack.py` | Original synthesized soundtrack per cut (no samples). |
| `render.py` | Renders videos, single frames and stills. |
| `CAPTIONS.md` | Titles, descriptions, captions, tags and the LinkedIn post. |

```bash
/usr/local/bin/python3 soundtrack.py long soundtrack-long.wav     # any python with numpy + scipy
/usr/local/bin/python3 soundtrack.py short soundtrack-short.wav
python3 render.py video long ~/Startups/orbit-launch-kit/videos  # about 30 minutes on an 8 GB Mac
python3 render.py video short ~/Startups/orbit-launch-kit/videos
python3 render.py stills ~/Startups/orbit-launch-kit/images
python3 render.py still short 3.5 ~/Startups/orbit-launch-kit/images/reel-cover.png
```

Needs playwright (drives the installed Google Chrome) and ffmpeg. Run renders one at a time. Copy rules: no em dashes, sentence case, "My X" for own-resource UI chrome, monochrome silver only.
