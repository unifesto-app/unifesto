# W1 · 19–25 Oct · One Space for your whole team

Board: P24 (W1 package, split out of P5). Everything here is a **draft**. Nothing has been posted, uploaded, scheduled or sent. Publish each item yourself, or approve it one at a time in chat.

## Before anything goes out

1. **Fees (as live on /pricing and /terms, checked 19 Oct).** Buyer: 5% processing fee at checkout on every plan, max ₹99 per ticket, not refundable. Organiser: platform fee 0% today; from **2 Nov 2026** (A10 go-live) 2.5% Starter / 1.5% Pro / 1% Enterprise on paid tickets sold from that date (launch pricing). Free RSVP events: no fees. ₹500 Starter ticket: buyer ₹525; organiser ₹500 before 2 Nov, ₹487.50 from 2 Nov. If a W1 piece slips past 2 Nov, drop the "today 0%" rows. Never describe fees from demo-Space money numbers (that Space is on the comped FREE model). Open: GST on either fee is not stated in the copy.
2. **Registration is app-only.** The web register page redirects to the event page; attendees register in the Unifesto app. The blogs say so. Don't let any copy say "register on the web".
3. **Header phone number.** Your real number shows top-right on space.unifesto.app desktop. Crop or blur it in the recording.
4. **Google Forms facts.** Re-open the two Google help links in `03` on publish day.

## Calendar

Re-timed 19 Oct evening: Monday's slots were missed and the long video needs the screen clips + Bujji render, so it moves to **Thu 22**. Anything that links to the video waits for the upload. If the video slips to Fri, every row marked "needs video" moves one day later and the DMs go out Sat.

| Day | Time (IST) | Channel | What | File | Needs video? | Status |
|---|---|---|---|---|---|---|
| Mon 19 | tonight | IG story | BTS + poll | `06-instagram.md` | no | ready |
| Tue 20 | 9 AM | LinkedIn (founder) | "One person knows everything" | `05-linkedin.md` | no | draft, ready |
| Wed 21 | 9 AM | LinkedIn (company) | How-to carousel as a PDF | `05-linkedin.md`, `assets/howto-carousel.pdf` | no | ready |
| Wed 21 | 10 AM | Blog (Apex) | How to organize a college fest: the 8-week checklist, then Rich Results Test (P16) | `02-blog-how-to-organize-a-college-fest.md` | no | draft, ready |
| Thu 22 | 6 PM | YouTube | How to run a college club: your Space and team in 10 minutes | `01-video-script.md` (title, description, tags, chapters), `assets/thumbnail-bujji.jpg` / `assets/thumbnail.png` | is the video | needs render + edit + upload |
| Thu 22 | 8 PM | Instagram | How-to carousel | `assets/howto-carousel/`, `06-instagram.md` | yes | ready |
| Fri 23 | 9 AM | LinkedIn (founder) | Google Forms, honestly + PDF | `05-linkedin.md`, `assets/vs-google-forms-carousel.pdf` | no | draft, ready |
| Fri 23 | 10 AM | Blog (Apex) | Google Forms for event registration vs Unifesto | `03-blog-unifesto-vs-google-forms.md` | no | draft, check 4 |
| Fri 23 | all day | Outreach DMs (10) | Send the video to fest and club pages | see below | yes | to do |
| Fri 23 | 7 PM | YT Shorts + IG Reels | Short 1: Who can do what in your club | `04-shorts.md`, `assets/short1-cover.png` | yes (cut) | needs edit |
| Sat 24 | 7 PM | YT Shorts + IG Reels | Short 2: Every event gets its own team | `04-shorts.md`, `assets/short2-cover.png` | yes (cut) | needs edit |
| Sat 24 | 8 PM | Instagram | Unifesto vs Google Forms carousel | `assets/vs-google-forms-carousel/`, `06-instagram.md` | no | draft, ready |
| Sun 25 | 7 PM | YT Shorts + IG Reels | Short 3: Organiser POV, 2 AM UPI screenshots | `04-shorts.md`, `assets/short3-cover.png` | no | needs recording (40 s) |
| Mon 26 | 9 AM | LinkedIn (company) | 75 s video in the frame (spills into W2's first morning) | `05-linkedin.md`, `assets/linkedin-frame/` | yes (cut) | needs edit |
| Daily | | IG stories | See the stories table | `06-instagram.md` | | ready |

Video length: the cut runs about 7:30. The title's "in 10 minutes" is setup time; never call it "a 10-minute video" in posts or DMs.

Email: none in W1 (every 2 weeks, first one in W2).

## What you need to do

- **Record** the screen clips for the long video by Tue (shot list in `01`, the S rows), and 40 s of extra footage for Short 3. Bujji scenes + voice are rendered in `~/Startups/unifesto-video`.
- **Edit** the long video, 3 Shorts (cut points in `01` and `04`) and the 75 s LinkedIn cut.
- **Approve** each post, then publish it yourself (or tell me which one to prepare next).

## Outreach DM (Fri 23, 10 pages)

```
Hi! I'm Abhinav from Unifesto. We made a short video on running a club from one place: your team, roles, and a crew for every event. Thought it might help with your next fest: <YouTube link>?utm_source=instagram&utm_campaign=v5-w1

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
assets/thumbnail-bujji.jpg                 YouTube thumbnail A, Bujji (3840x2160)
assets/thumbnail.png                       YouTube thumbnail B, dashboard phone (1280x720)
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
