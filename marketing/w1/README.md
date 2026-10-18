# W1 · 19–25 Oct · One Space for your whole team

Track P item P5. Everything here is a **draft**. Nothing has been posted, uploaded, scheduled or sent. Publish each item yourself, or approve it one at a time in chat.

## Before anything goes out

1. **Fee mismatch (blocker for both blogs, the vs carousel and the Fri LinkedIn post).** The copy quotes `/pricing` (`PLANS` in `websites/web/src/lib/site.ts`): Starter 2.5% platform fee on paid tickets. The live Finance screen in the demo Space shows a 5% "processing fee (paid by buyers)" and the organiser keeping 100% of ticket sales. Confirm which one a new Starter Space gets today. If it is the 5% buyer fee, either fix `/pricing` first or change the fee lines in `02`, `03`, `assets/vs-google-forms-carousel.json` (slide 7) and re-render.
2. **Registration is app-only.** The web register page redirects to the event page; attendees register in the Unifesto app. The blogs say so. Don't let any copy say "register on the web".
3. **Header phone number.** Your real number shows top-right on space.unifesto.app desktop. Crop or blur it in the recording.
4. **Google Forms facts.** Re-open the two Google help links in `03` on publish day.

## Calendar

| Day | Time (IST) | Channel | What | File | Status |
|---|---|---|---|---|---|
| Mon 19 | morning | YouTube (record) | Record the long video | `01-video-script.md` | to record |
| Mon 19 | 9 AM | LinkedIn (founder) | "One person knows everything" | `05-linkedin.md` | draft, ready |
| Mon 19 | 7 PM | YT Shorts + IG Reels | Short 1: Who can do what in your club | `04-shorts.md`, `assets/short1-cover.png` | needs edit from the recording |
| Mon 19 | evening | IG story | BTS + poll | `06-instagram.md` | ready |
| Tue 20 | 6 PM | YouTube | How to run a college club: your Space and team in 10 minutes | `01-video-script.md` (title, description, tags, chapters), `assets/thumbnail.png` | needs edit + upload |
| Tue 20 | 9 AM (after upload is fine too) | LinkedIn (company) | 75 s video in the frame | `05-linkedin.md`, `assets/linkedin-frame/` | needs edit |
| Wed 21 | 10 AM | Blog (Apex) | How to organize a college fest: the 8-week checklist | `02-blog-how-to-organize-a-college-fest.md` | draft, blocker 1 |
| Wed 21 | 8 PM | Instagram | How-to carousel | `assets/howto-carousel/`, `06-instagram.md` | ready |
| Wed 21 | 7 PM | YT Shorts + IG Reels | Short 2: Every event gets its own team | `04-shorts.md`, `assets/short2-cover.png` | needs edit |
| Thu 22 | 9 AM | LinkedIn (company) | How-to carousel as a PDF | `05-linkedin.md`, `assets/howto-carousel.pdf` | ready |
| Thu 22 | all day | Outreach DMs (10) | Send Tuesday's video to fest and club pages | see below | to do |
| Fri 23 | 10 AM | Blog (Apex) | Google Forms for event registration vs Unifesto | `03-blog-unifesto-vs-google-forms.md` | draft, blocker 1 + 4 |
| Fri 23 | 9 AM | LinkedIn (founder) | Google Forms, honestly + PDF | `05-linkedin.md`, `assets/vs-google-forms-carousel.pdf` | draft, blocker 1 |
| Fri 23 | 8 PM | Instagram | Unifesto vs Google Forms carousel | `assets/vs-google-forms-carousel/`, `06-instagram.md` | draft, blocker 1 |
| Fri 23 | 7 PM | YT Shorts + IG Reels | Short 3: Organiser POV, 2 AM UPI screenshots | `04-shorts.md`, `assets/short3-cover.png` | needs recording (40 s) |
| Sat 24–Sun 25 | | IG stories | Stories only; batch W2 edits | `06-instagram.md` | ready |

Email: none in W1 (every 2 weeks, first one in W2).

## What you need to do

- **Record** the long video Mon (script + shot list in `01`), and 40 s of extra footage for Short 3.
- **Edit** the long video, 3 Shorts (cut points in `01` and `04`) and the 75 s LinkedIn cut.
- **Approve** each post, then publish it yourself (or tell me which one to prepare next).
- **Check** blocker 1 before Wed.

## Outreach DM (Thu, 10 pages)

```
Hi! I'm Abhinav from Unifesto. We made a 10-minute video on running a club from one place: your team, roles, and a crew for every event. Thought it might help with your next fest: <YouTube link>?utm_source=instagram&utm_campaign=v5-w1

If you'd like a Space for your club, it's free for RSVP events. Happy to set it up with you.
```

## Files

```
01-video-script.md                         long video: shot list, voiceover, chapters, YouTube upload copy
02-blog-how-to-organize-a-college-fest.md  guide blog (Apex fields + markdown body)
03-blog-unifesto-vs-google-forms.md        comparison blog (Apex fields + markdown body)
04-shorts.md                               3 Shorts: scripts, on-screen text, titles, IG captions
05-linkedin.md                             3 posts + video cut note
06-instagram.md                            carousel captions + daily stories
assets/*.json                              template pieces (render: python3 ../templates/render.py *.json from assets/)
assets/thumbnail.png                       YouTube thumbnail 1280x720
assets/howto-carousel/ + .pdf              IG slides + LinkedIn PDF
assets/vs-google-forms-carousel/ + .pdf    IG slides + LinkedIn PDF
assets/short{1,2,3}-cover.png              Short covers 1080x1920
assets/linkedin-frame/                     01 overlay (clip slot), 02 preview poster
assets/shots/                              demo Space shots copied from content-bank (no emails, no payment IDs)
```

Re-render after edits:

```bash
cd marketing/templates && python3 render.py ../w1/assets/*.json
```
