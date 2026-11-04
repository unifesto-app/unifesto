# Unifesto 5.0 launch · social posts and channel art

All **drafts**. Nothing posted, uploaded, scheduled or sent. Captions are in `CAPTIONS.md`.

The look is the store listing's (`../store-5.0`): the same Horizon frame (`frame.css`) and the same app screens (`app.js`), so the launch matches what people see in the App Store and Google Play.

## Before anything goes out

1. **Only after both stores show 5.0.** Post on release day, after **Release This Version** in App Store Connect and **Publish** in Play Console, once the store pages show version 5.0.0. Until then the "Update to 5.0" posts point at 4.0.5.
2. **App screens.** These posts show 5.0 screens. The W2 note ("Don't film 5.0 app screens, teaser-only until 2 Dec") is superseded by the 15 Nov release and the approved store screenshots.
3. **Numbers.** "10,000+ people checked in", "70 live Spaces" and "25+ events" are `PROOF` in `websites/web/src/lib/site.ts` as of October 2026. Do not call the 70 Spaces customers (`../listings/facts.md`).
4. **Demo names.** Every name and number inside the app screens (Aurora Fest, Riya Patel, ₹ figures) is demo data.

## Files

Render: `python3 render.py carousel square story banner`, then `python3 render.py reel` and `sh reel.sh` for the video (needs `../store-5.0/out/preview.mp4` from `python3 ../store-5.0/preview.py`). Output lands in `out/` (not committed).

| File | Size | Where |
|---|---|---|
| `out/carousel/01-07.png`, `out/carousel.pdf` | 1080×1350 | Instagram carousel; the PDF is the LinkedIn document post |
| `out/square/01.png` | 1080×1080 | X, LinkedIn, YouTube community post, WhatsApp |
| `out/square/02.png` | 1080×1080 | Organiser angle: LinkedIn company, X |
| `out/story/01-03.png` | 1080×1920 | Instagram and WhatsApp status, in order |
| `out/launch-reel.mp4` | 1080×1920, 31.5 s | Instagram Reel, YouTube Short, LinkedIn video |
| `out/banner/01.png` | 1584×396 | LinkedIn personal background (Abhinavtej) |
| `out/banner/02.png` | 2256×382 | LinkedIn company cover (1128×191 at 2x) |
| `out/banner/03.png` | 2560×1440 | YouTube channel banner |
| `out/banner/04.png` | 1500×500 | X header |
| `out/avatar/avatar-400.png` | 400×400 | LinkedIn company logo, X profile photo |
| `out/avatar/avatar-800.png` | 800×800 | YouTube profile picture |
| `out/avatar/avatar-1080.png` | 1080×1080 | Instagram, WhatsApp |
| `out/avatar/youtube-watermark-150.png` | 150×150 | YouTube Studio › Customisation › Branding › Video watermark |

The profile pictures are the approved `../brand-2026/png/social-avatar-1080.png`, resized; the logo is unchanged.

## Calendar (release day, Sun 15 Nov, IST)

| Time | Channel | What | Caption |
|---|---|---|---|
| after the stores show 5.0 | All | Swap banners and profile pictures | (none) |
| 9 AM | LinkedIn (founder) | Founder post + carousel PDF | `CAPTIONS.md` › LinkedIn founder |
| 9:30 AM | LinkedIn (company) | Company post + carousel PDF; founder reshares | LinkedIn company |
| 10 AM | X | Post with square 01, then the thread | X |
| 12 PM | WhatsApp | Broadcast + status (story 01-03) | WhatsApp |
| 7 PM | Instagram | Carousel | Instagram carousel |
| 7:30 PM | Instagram + YouTube | Reel and Short (`launch-reel.mp4`) | Instagram Reel, YouTube Short |
| 8 PM | Instagram stories | Story 01-03 with the link sticker | Instagram stories |
| Mon 16, 9 AM | LinkedIn (company) | Organiser post with square 02 | LinkedIn organisers |
| Mon 16 | YouTube community | Square 01 | YouTube community |

Reply to every comment in the first hour.
