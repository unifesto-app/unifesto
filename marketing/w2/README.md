# W2 · 26 Oct–1 Nov · Tickets that sell themselves

Track P item P5. All **drafts**. Nothing posted, uploaded, scheduled or sent.

## Before anything goes out

1. **Fee mismatch (same blocker as W1).** `/pricing` says Starter 2.5%; the live demo Finance screen shows a 5% buyer processing fee. Affects `03`, `assets/vs-townscript-carousel.json` (slide 6), the Fri LinkedIn post and the IG caption. Settle it before Fri 30 Oct.
2. **Townscript facts.** Fees checked on townscript.com/i/pricing on 18 Oct (India, INR: 2% + ₹0 per ticket, 2% gateway, excl. taxes). Four feature cells in `03` say `Verify`: fill them from Townscript's own pages or a test event, or write "Not listed". Re-check the fee on publish day.
3. **No attendee rows on camera.** The attendee list and group seats show demo emails and `demo_pay_` IDs. The script uses ticket detail screens instead.
4. **App screens.** Registration happens in the app. Don't film 5.0 app screens (teaser-only until 2 Dec).

## Calendar

| Day | Time (IST) | Channel | What | File | Status |
|---|---|---|---|---|---|
| Mon 26 | morning | YouTube (record) | Record the long video | `01-video-script.md` | to record |
| Mon 26 | 9 AM | LinkedIn (founder) | "The hardest form to build" | `05-linkedin.md` | draft, ready |
| Mon 26 | 7 PM | YT Shorts + IG Reels | Short 1: One payment. Four passes. | `04-shorts.md`, `assets/short1-cover.png` | needs edit |
| Tue 27 | 6 PM | YouTube | How to sell event tickets online: tickets, groups and coupons | `01-video-script.md`, `assets/thumbnail.png` | needs edit + upload |
| Tue 27 | 9 AM or after upload | LinkedIn (company) | 75 s video in the frame | `05-linkedin.md`, `assets/linkedin-frame/` | needs edit |
| Wed 28 | 10 AM | Blog (Apex) | Team registration form for college fests (template + a better way) | `02-blog-team-registration-form.md` | draft, ready |
| Wed 28 | 8 PM | Instagram | How-to carousel | `assets/howto-carousel/`, `06-instagram.md` | ready |
| Wed 28 | 7 PM | YT Shorts + IG Reels | Short 2: Ask every member, not just the lead | `04-shorts.md`, `assets/short2-cover.png` | needs edit |
| Thu 29 | 9 AM | LinkedIn (company) | How-to carousel PDF | `05-linkedin.md`, `assets/howto-carousel.pdf` | ready |
| Thu 29 | 10 AM | Email (Apex campaigns) | Curator email #1 | `07-curator-email.md` | draft; needs both video links + your OK |
| Thu 29 | all day | Outreach DMs (10) | Send Tuesday's video | below | to do |
| Fri 30 | 10 AM | Blog (Apex) | Townscript alternatives: Unifesto vs Townscript (2026) | `03-blog-unifesto-vs-townscript.md` | draft, blockers 1 + 2 |
| Fri 30 | 9 AM | LinkedIn (founder) | Townscript, honestly + PDF | `05-linkedin.md`, `assets/vs-townscript-carousel.pdf` | draft, blocker 1 |
| Fri 30 | 8 PM | Instagram | Unifesto vs Townscript carousel | `assets/vs-townscript-carousel/`, `06-instagram.md` | draft, blocker 1 |
| Fri 30 | 7 PM | YT Shorts + IG Reels | Short 3: Team of 4, 4 different spellings | `04-shorts.md`, `assets/short3-cover.png` | needs 20 s screen recording |
| Sat 31–Sun 1 | | IG stories | Stories only; batch W3 edits | `06-instagram.md` | ready |

## What you need to do

- **Record** Mon 26 (script in `01`) plus the fake-sheet clip for Short 3.
- **Edit** the long video, 3 Shorts, the 75 s LinkedIn cut.
- **Fill** the Townscript `Verify` cells; **settle** the fee blocker.
- **Approve** the curator email in chat before it goes out.

## Outreach DM (Thu, 10 pages)

```
Hi! Abhinav from Unifesto here. Selling tickets for a fest or a team event this season? We made an 8-minute guide on ticket types, group tickets where every member gets their own pass, and coupons: <YouTube link>

Free team registration form template too: https://www.unifesto.app/blog/team-registration-form?utm_source=instagram&utm_campaign=v5-w2
```

## Files

```
01-video-script.md                     long video: shot list, voiceover, chapters, YouTube copy
02-blog-team-registration-form.md      guide blog
03-blog-unifesto-vs-townscript.md      comparison blog (with the 18 Oct fee check)
04-shorts.md                           3 Shorts
05-linkedin.md                         3 posts + video cut note
06-instagram.md                        carousel captions + daily stories
07-curator-email.md                    curator email #1 (subject A/B, preview, HTML body)
assets/                                thumbnail, 2 carousels (PNG + PDF), 3 Short covers, LinkedIn frame, shots
```

Re-render after edits:

```bash
cd marketing/templates && python3 render.py ../w2/assets/*.json
```
