# W1 Shorts (YouTube Shorts + Instagram Reels, same file)

9:16, 1080x1920, under 60 s. Burn in captions (white Hanken Grotesk, bottom third, above the IG UI). First frame = the cover text, so the grid and the Shorts shelf both read it. Playlist: Shorts. Every link tracked: `utm_source=youtube` or `instagram`, `utm_campaign=v5-w1`.

**Notes:** links in YouTube Shorts descriptions are not clickable (since 31 Aug 2023). In YouTube Studio set **Related video** = the 6 PM long video on Shorts 1, 2 and 3; the descriptions only carry a plain-text domain. If the long video moves to Wed 21, Short 3 still goes Tue 9 PM: add its Related video once the long video is up. Burned-in CTAs say a domain, not "link in bio", because the same file goes to YouTube, which has no bio; IG captions keep "Link in bio."

---

## Short 1: Who can do what in your club

**Out:** Tue 20 Oct, 7 PM IST, after the 6 PM long video (moves to Wed with it if the video misses the 3 PM go/no-go). **Cut from:** long video 2:50–4:05 (Bujji's keycards + IAM grid), reframed to 9:16, Bujji full frame. **Cover:** `assets/short1-cover.png`.

Captions = the voice column. Lines marked (L) are trims of the long-video audio; lines marked (new) need a fresh TTS render in the long video's Bujji voice.

| Time | On screen | On-screen text | Bujji says |
|---|---|---|---|
| 0–3 s | Bujji, worried eyes | Should your gate volunteer see your bank details? | (L18 trim) Should your gate volunteer see your bank details? |
| 3–9 s | Spreadsheet vs My Space split | Everyone sees everything vs everyone sees their part | (L19) In a shared spreadsheet, everyone sees everything. In a Space, everyone sees their part. |
| 9–17 s | CURATOR keycard | Curator: runs the event | (L20 trim) A Curator runs an event end to end. |
| 17–25 s | CO-CURATOR keycard, money struck through | Co-Curator: helps, no money | (L21) A Co-Curator helps run it. But publishing, cancelling and the money stay with the Curator. |
| 25–33 s | CREW keycard | Crew: scans at the gate | (L22 trim) They see the event and scan passes at the gate. That's it. |
| 33–40 s | IAM grid, hover a checkbox | You decide, per Space | (new) And you decide what each role can do, just for your club. |
| 40–45 s | Ring 03 locks | Full guide on the channel | (new) Full guide on our channel. See you among the stars! |

**YouTube title:** Who can do what in your college club #shorts
**YouTube Related video:** the 6 PM long video.
**YouTube description:** How to run a college club: give each person the right role. Full guide: tap the related video. unifesto.app
**IG caption:**

```
Not everyone in your club needs access to the money 👀

Curator runs the event.
Co-Curator helps.
Crew scans at the gate.
You decide what each role can touch.

Full setup video on our YouTube. Link in bio.

#collegeclub #collegefest #studentclub #eventmanagement #unifesto #clublife #hyderabad
```

---

## Short 2: Every event gets its own team

**Out:** Tue 20 Oct, 8 PM IST (moves to Wed with the long video if it misses the 3 PM go/no-go). **Cut from:** long video 4:05–5:14 (event moons, team roster, role picker open, one avatar as Crew and Curator). **Cover:** `assets/short2-cover.png`.

Captions = the voice column. Lines marked (L) are trims of the long-video audio; lines marked (new) need a fresh TTS render in the long video's Bujji voice.

| Time | On screen | On-screen text | Voiceover |
|---|---|---|---|
| 0–2 s | Cover frame | Every event gets its own team | (L25) Your fest has ten events. Who's running which? |
| 2–12 s | Aurora Fest 2026 > Team roster | Pick from your Space | (L28 trim) Each event gets its own team, picked from your Space. |
| 12–24 s | Role picker open | Curator · Co-Curator · Crew | (L28 trim) Pick a person, pick their role, for this event only. |
| 24–34 s | Back to roster | Crew here. Curator there. | (L29) Same person. Crew at the fest. Curator at the design workshop. |
| 34–40 s | Space home | unifesto.app/request-space | (new) Set up your Space at unifesto dot app. |

**YouTube title:** Give every college fest event its own team #shorts
**YouTube Related video:** the 6 PM long video.
**YouTube description:** One Space for your club, one team per event. Full guide: tap the related video. unifesto.app
**IG caption:**

```
Ten events. One fest. Who's running what? 🤔

Give every event its own team, picked from your club's Space.
Same person can be Crew at the fest and Curator at the workshop.

Save this for fest season 🔖 Link in bio.

#collegefest #techfest #culturalfest #eventplanning #unifesto #studentlife
```

---

## Short 3: Organiser POV, 2 AM matching UPI screenshots (Spreadsheet vs Space)

**Out:** Tue 20 Oct, 9 PM IST (the Google Forms blog is up from 10:30 AM). **Format:** recurring "Organiser POV" / "Spreadsheet vs Space". **Cover:** `assets/short3-cover.png`.
**Record:** nothing to record: it's animated. `assets/short3.mp4` (1080x1920, 45 s, H.264 + AAC) is drawn with the Bujji kit (`~/Startups/unifesto-video-short3`, `src/short3.py`): Bujji at the desk at night, drawn generic payment screenshots (fake "Student N" names, masked refs, ₹200, blurred), the sheet at row 214, head on the desk, then hard cut: the Space opens out of the app icon and the real Aurora Fest screens play in the site's phone frame. The night's screenshots burst into starlight, and site-style panels lift the shots' own numbers out of the screen: sold 70 and ₹25,130 count up, 11 squads fill 44 / 60 seats, and Bujji's own pass is scanned to take Live check-in from 60 to 61 of 70. The end card is the site's hero in miniature: the two-tone "Run the whole event. Not just the ticket page.", a tapped Request a Space button and "Free to start". Synth music and SFX, no voice-over, captions burned in. The cover is the opening frame (`python3 src/short3.py one 1.2 1 out/short3-cover.png`).

| Time | On screen | On-screen text | Voiceover / sound |
|---|---|---|---|
| 0–2 s | Cover frame | 2 AM. Matching UPI screenshots. | (trending low-volume audio, or silence + keyboard) |
| 2–8 s | Phone gallery scrolling payment screenshots (make your own fake ones with ₹1 test payments, or blur fully) | POV: you run the fest's registrations | none |
| 8–14 s | Laptop: a Google Sheet with "paid?" column, cursor on a blank cell | Row 214. Paid? Maybe. | none |
| 14–18 s | Head on the desk | Day 3 of this | none |
| 18–20 s | Hard cut, light on, upbeat | Meanwhile, with a Space: | none |
| 20–32 s | Space app: event ticket list (Aurora Fest ticket types) then Squad of 4 detail | Paid at registration. Every seat counted. | none |
| 32–40 s | Check-in screen, recent check-ins list | QR at the gate. Done. | none |
| 40–45 s | End card | unifesto.app/request-space (YouTube Shorts has no bio; the IG caption keeps "Link in bio") | none |

Use only fake screenshots. Never show a real person's UPI ID, name or phone.

**YouTube title:** POV: it's 2 AM and you're matching UPI screenshots #shorts
**YouTube Related video:** the long video (once it is up).
**YouTube description:** Google Forms for event registration vs a Unifesto Space. Full comparison on our blog: unifesto.app/blog
**IG caption:**

```
POV: it's 2 AM and you're matching UPI screenshots to a Google Form 🫠

Tag the person who did this for your fest 👇

We compared Google Forms and Unifesto, honestly. Forms still wins for surveys and small free events. For a paid fest, read the comparison: link in bio.

#collegefest #googleforms #eventorganiser #festseason #studentlife #relatable #unifesto
```
