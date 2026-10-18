# Content templates (Track P2)

Reusable pieces on the Unifesto cosmos look: black night, silver type, planet with a lit edge, orbit hairlines, horizon, stars. Michroma for display, Hanken Grotesk for body. Each template is an HTML page. A piece is a small JSON file that fills it in. `render.py` turns pieces into PNGs (and a LinkedIn PDF for carousels) with headless Chrome.

| Template | Size | Pages out |
|---|---|---|
| `carousel` | 1080x1350 | one PNG per slide + `<name>.pdf` for LinkedIn |
| `short-cover` | 1080x1920 | one PNG |
| `thumbnail` | 1280x720 | one PNG |
| `linkedin-frame` | 1920x1080 | `01.png` overlay with a transparent clip slot, `02.png` preview (only if `poster` is set) |
| `countdown` | 1080x1920 | one PNG per value in `days` |

## Make a piece

1. Copy the closest example JSON (`examples/w1/` or `examples/samples/`) into a new folder, e.g. `examples/w2/`.
2. Edit the copy. Copy the screenshots it needs next to it (e.g. `examples/w2/shots/`). Image paths are relative to the JSON file.
3. Render:

```bash
python3 render.py examples/w2/thumbnail.json
```

Pass several files to render a whole week in one browser: `python3 render.py examples/w2/*.json`. Output lands next to the JSON: `thumbnail.png`, or a `howto-carousel/` folder with `01.png`, `02.png` ... plus `howto-carousel.pdf`.

Setup, once: `pip install playwright`. It drives the installed Google Chrome, so there is no Chromium download.

To preview while editing, open a template HTML file in a browser: it shows its built-in defaults (the same fields, at the top of its `<script>`).

## Fields

Copy text everywhere: `*word*` renders dimmed (the second half of a headline), `\n` forces a line break.

**Screenshots** (`shot`) are a path, or `{ "src": "...", "frame": "phone" | "browser", "crop": [x, y, w, h], "url": "space.unifesto.app" }`. Files with `mobile` in the name get a phone frame, others a browser frame. `crop` is in source pixels: use it to cut out anything that should not be posted. Shots are never shown above their native size; if a layout would upscale one, `render.py` prints a warning.

- **carousel**: `slides`, each with a `kind`:
  - `cover`: `label`, `title`, `lede`, `shot`
  - `step`: `title`, `text`, `shot` (numbered 01, 02 ... automatically)
  - `story`: `quote`, `name`, `role`, optional `photo` (a real event photo at least 904px wide) and `photoHeight`
  - `cta`: `title`, `lede`, `pills` (the first is solid)

  How-to = cover, steps, cta. Story = cover, story slides, cta. A phone shot runs off the bottom edge from `shotTop` (default 700 on a cover, 600 on a step); a browser shot sits between the copy and the footer. Optional top-level `handle` replaces `unifesto.app` in the footer.
- **short-cover**: `label`, `title`, optional `lede`, `shot`, `shotTop`, `size` (title px). Copy stays inside the middle 1080x1440 that Instagram shows in the grid.
- **thumbnail**: `hook` (3 to 5 words), `shot`, optional `size` (default 96). Check it at 160px wide before posting.
- **linkedin-frame**: `clip` (`"16:9"` or `"9:16"`), `title`, `sub`, optional `poster`. Put `01.png` on the track above the clip in your editor; the slot is 1376x774 at (272, 236) for 16:9 and 540x960 at (1220, 60) for 9:16.
- **countdown**: `date` (default `2026-12-02`), `days` (a number, a list, or leave it out to count from today in India time), optional `line`. `0` renders the launch-day story.

## Rules

- Monochrome silver only. No second accent colour.
- Sentence case, no ALL-CAPS labels, no em dashes. Short, organiser-first headlines.
- Only use content-bank shots without `demo.N@example.com` emails or `demo_pay_` / `demo_order_` IDs, or crop them out (see `content-bank/INDEX.md`). Don't commit the content bank; copy just the shots a piece needs.

## Layout

```
kit/cosmos.css    fonts, tokens, sky (stars, planet, orbits, horizon), device frames
kit/kit.js        page/sky/shot/wordmark helpers, runs a template and flags upscaled shots
*.html            the five templates
render.py         piece JSON -> PNG / PDF
examples/w1/      W1 pieces ("How to run a college club: your Space and team in 10 minutes")
examples/samples/ story carousel, LinkedIn frames, countdown
```
