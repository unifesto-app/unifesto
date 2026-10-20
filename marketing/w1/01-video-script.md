# W1 long video: How to run a college club: your Space and team in 10 minutes

Board: **P24**. Publish **Tue 20 Oct, 6 PM IST**. Playlist: Guides. Target query (P15): "how to run a college club". Runtime about 7:10 + 20 s end screen.

## The idea

Not a screen tour. One story: **the club that survives its president graduating.**

- **Hook** opens a loop: the senior who knows everything graduates, and the club starts from zero.
- **Main** closes it, one piece at a time. A recurring visual, **the club orbit**, does the work: My Space is the core, and each chapter locks in one ring around it (Team, Roles, Event crews). The outer ring, Handover, stays dashed until the end.
- **Ending** pays the hook off ("Your president graduates. Your club doesn't."), recaps the four rings, gives one CTA and teases W2.

**Bujji hosts**, same character, voice and sign-off as "What is Unifesto?" (P0), so the channel has one face. Bujji is full screen in the story beats and a small corner bug (lower right, mouth-synced) during screen demos, so the voice always has a face.

## Look (match www.unifesto.app, cosmos theme)

- Background: the site's cosmos (night `#000`, faint 1px orbit arcs at glow .07). The club orbit is drawn with those same arcs, brightened to show progress.
- Type: Michroma for headlines (thin, large), Hanken Grotesk for body and captions, Martian Mono for small uppercase labels (`01 · SPACE`, `DEMO SPACE · SAMPLE DATA`).
- Components: the site's own pieces only. Panel with dots titlebar for every screen recording, silver primary button with arrow for the CTA, chips, avatars, the ticket card (reused as the role keycards), 4:3 event covers.
- Monochrome. The logo and app tile are never recoloured, tilted or glowed. No third-party logos (the group chats in the hook are generic bubbles, no WhatsApp marks).
- Copy: organiser-first, no em dashes, "My X" in UI.

## Production

- **Bujji scenes**: render in the kit at `~/Startups/unifesto-video` (Skia, frames as pure functions of `t`). Reuse `panel()`, `chip()`, `avatar()`, `btn()`, `ellipse_arc()`, `logo_tile()`, `draw_bujji()`. New scenes: `s_cold_open`, `s_orbit` (the persistent device, takes a `rings_locked` count), `s_keycards`, `s_moons`, `s_handover`, `s_recap`.
- **Voice**: Bujji's lines below go into `data/script.json` (ids `W1-L01`…), then kokoro TTS with the same voice as P0, timeline, music bed, loudnorm −14 LUFS (steps in the kit's CLAUDE.md).
- **Screen recordings** (you record, Mon): space.unifesto.app as the demo owner, Space **Aurora Tech Club**. Composite each clip inside `panel()` on the cosmos background; zoom with the kit's expo ease, cursor gets a soft silver ring.
- **Output**: 3840x2160 16:9 for YouTube (the P0 4096x2864 frame is not 16:9) plus a 1920x1080 copy. Captions: SRT from the timeline (`subtitles.py`), uploaded, not auto.

### Recording safety (demo Space)

- Browser 1440x900, zoom 110%, bookmarks hidden, Do Not Disturb on.
- **Your real phone number shows in the desktop header (top right).** Crop to the content area or blur it.
- No attendee list with emails on screen. If one slips in, blur `demo.N@example.com`.
- **Payout account picker shows a real UPI ID** (P23). Don't open Event Settings > payouts.
- Never press "Send for approval" on ownership transfer or "Save" on a role change. Show, then cancel.
- Phone shots: space.unifesto.app in a phone browser (or Chrome at 375x812), not the Unifesto app (mobile 5.0 is teaser-only until 2 Dec).

## Script

`B` = Bujji full screen (kit scene). `S` = screen recording in a panel, Bujji as corner bug. `T` = text-only card.

### HOOK (0:00–0:40)

| Time | Shot | On screen | Bujji says |
|---|---|---|---|
| 0:00 | B | Black, one orbit arc. A phone mockup fills with group chats stacking: "Fest core 2025", "Fest core 2025 (new)", "Volunteers FINAL", "Sponsors do not leave", "Fest core 2026??" | **W1-L01** Five group chats. One Google Form. And one senior who knows where everything is. |
| 0:06 | B | An avatar chip "Club president · Batch of 2026" lifts out of the phone and drifts off frame. Chats grey out one by one | **W1-L02** In May, they graduate. And your club starts again from zero. |
| 0:12 | B | Bujji jets in, worried eyes turn happy. Michroma headline: "Your club shouldn't graduate with your president." | **W1-L03** Let's make sure that never happens. Ten minutes. I'll show you. |
| 0:19 | T | Title lockup: "How to run a college club" + mono label `YOUR SPACE AND TEAM IN 10 MINUTES` | (music hit) |
| 0:22 | B | Bujji waves. The club orbit draws in: core `MY SPACE`, rings `01 SPACE` `02 TEAM` `03 ROLES` `04 EVENT CREWS`, outer dashed ring `05 HANDOVER` | **W1-L04** Hi, I'm Bujji from Unifesto. By the end, your club runs on one Space with four rings around it. Each chapter, we lock one in. |
| 0:32 | B | Dashed outer ring pulses. Chips: `10,000+ CHECKED IN` `25+ EVENTS` `70 SPACES LIVE` `AS OF OCTOBER 2026`, then `DEMO SPACE · SAMPLE DATA` | **W1-L05** And stay for the last ring. It's the one every club gets wrong. |

### MAIN

#### Chapter 1 · The Space (0:40–1:50)

| Time | Shot | On screen | Bujji says |
|---|---|---|---|
| 0:40 | B | Orbit core glows. Label `01 · SPACE` | **W1-L06** First, a home for your club that doesn't live on anyone's laptop. |
| 0:46 | S | unifesto.app/request-space, scroll the form slowly (don't submit) | **W1-L07** Request a Space for your club, community or college. We check it and switch it on. Starter is free, and free RSVP events never carry a fee. |
| 1:02 | S | Space home, Aurora Tech Club: zoom on the stat row (published, draft, attendees, events) | **W1-L08** This is Aurora Tech Club, a demo Space. Every event, every member and every rupee lives here. |
| 1:14 | S | Settings > Space profile: name, link `aurora-tech-club`, one-line description, a tag typed then removed (don't save) | **W1-L09** Give it a name, a link and one line about who should join. That's your club's public page. |
| 1:30 | S | Point at the logo slot | **W1-L10** Add a square logo now. Event banners are 4:3, so make them that size from day one. |
| 1:42 | B | Ring 01 locks: arc brightens, mono tick `01 ✓ SPACE` | **W1-L11** Ring one. Your club has a home. |

#### Chapter 2 · Your team (1:50–2:50)

| Time | Shot | On screen | Bujji says |
|---|---|---|---|
| 1:50 | B | Empty ring 02 | **W1-L12** Now the people. |
| 1:53 | S | Members: roster of 6, "Total members" stat | **W1-L13** Members is everyone who helps run the club. |
| 2:02 | S | "Search users to add…", type a demo name, show the result, press Esc | **W1-L14** Search for anyone with a Unifesto account and add them. Ask your core team to sign up first. It takes a minute. |
| 2:18 | S | Role filter: All roles > Space Admin > back | **W1-L15** Space Admins control everything. Keep it to two: the president and one backup. Everyone else stays a member. |
| 2:34 | S | "Remove member" menu opened, then closed | **W1-L16** Someone leaves? One click, and their access ends right away. |
| 2:42 | B | Six avatars drop onto ring 02, it locks: `02 ✓ TEAM` | **W1-L17** Ring two. Your team is in. |

#### Chapter 3 · Who can do what (2:50–4:05)

| Time | Shot | On screen | Bujji says |
|---|---|---|---|
| 2:50 | B | Pattern break. Bujji, worried eyes. Michroma: "Should your gate volunteer see your bank details?" | **W1-L18** Quick question. Should your gate volunteer see your bank details? |
| 2:57 | B | Split: left "Shared spreadsheet" (every cell visible), right "My Space" (each person sees one lane) | **W1-L19** In a shared spreadsheet, everyone sees everything. In a Space, everyone sees their part. |
| 3:05 | B | Three keycards (site ticket card), dealt one at a time. **CURATOR**: edit, publish, cancel, money, attendees, team, check-in | **W1-L20** A Curator runs an event end to end. Page, tickets, money, attendees and team. |
| 3:17 | B | **CO-CURATOR**: edit, attendees, team, check-in. Struck through: publish, cancel, money | **W1-L21** A Co-Curator helps run it. But publishing, cancelling and the money stay with the Curator. |
| 3:30 | B | **CREW**: view the event, scan passes. Nothing else | **W1-L22** Crew are your volunteers on the day. They see the event and scan passes at the gate. That's it. |
| 3:40 | S | IAM page: slow pan across Curator, Co-Curator, Crew columns; hover a checkbox (don't change it) | **W1-L23** As a Space Admin, you can tick or untick what each role can do, just for your club. |
| 3:56 | B | Keycards slot into ring 03, it locks: `03 ✓ ROLES` | **W1-L24** Ring three. Everyone has the right key. |

#### Chapter 4 · A crew for every event (4:05–5:20)

| Time | Shot | On screen | Bujji says |
|---|---|---|---|
| 4:05 | B | Ring 04 fills with small moons: 4:3 event covers "Orientation", "Build Night", "Aurora Fest", "Design Workshop" | **W1-L25** Your fest has ten events. Who's running which? |
| 4:12 | S | Events > "New event", type "Orientation 2026", then cancel | **W1-L26** A new event starts with just a name. It stays a draft until you publish. |
| 4:24 | S | Build Night overview: setup checklist "3 of 4 essentials done." | **W1-L27** And a checklist tells you exactly what's left before it goes live. |
| 4:36 | S | Aurora Fest 2026 > Team: Curator, Co-Curator, 2 Crew. "Add a team member" > role picker open > Esc | **W1-L28** Each event gets its own team, picked from your Space. Pick a person, pick their role, for this event only. |
| 4:56 | B | One avatar glows on two moons: `CREW` on Aurora Fest, `CURATOR` on Design Workshop | **W1-L29** Same person. Crew at the fest. Curator at the design workshop. Nobody sees what they don't need. |
| 5:06 | S | Phone browser: hamburger > nav drawer > Space home | **W1-L30** And it all runs from your phone's browser, between classes. |
| 5:14 | B | Ring 04 locks: `04 ✓ EVENT CREWS` | **W1-L31** Ring four. |

#### Chapter 5 · The handover (5:20–6:20)

| Time | Shot | On screen | Bujji says |
|---|---|---|---|
| 5:20 | B | Callback: the hook's chip "Club president · Batch of 2026" floats back in. Outer dashed ring pulses | **W1-L32** Remember our president? It's May. Time to graduate. |
| 5:28 | S | Members > Ownership > "Transfer ownership", choose a member, show "Why are you handing it over?", then Cancel | **W1-L33** Transfer the Space to next year's lead. We approve it, they own it, and you stay on the team to help. |
| 5:46 | B | The core passes from one avatar to another. Every ring stays lit. Past events flicker past as moons | **W1-L34** Every event, every attendee count and every report stays with the club. |
| 5:58 | B | Outer ring turns solid: `05 ✓ HANDOVER`. Michroma: "Your president graduates. Your club doesn't." | **W1-L35** Your president graduates. Your club doesn't. |

### ENDING (6:20–7:10, end screen to 7:30)

| Time | Shot | On screen | Bujji says |
|---|---|---|---|
| 6:20 | B | Full orbit. Each ring flashes as named | **W1-L36** So: one Space. Your team. Clear roles. A crew for every event. And a handover that keeps it all. |
| 6:36 | B | Silver primary button `REQUEST YOUR SPACE →`, mono `unifesto.app/request-space` | **W1-L37** Request your club's Space with the link below. Free to start. |
| 6:46 | B | Next-video card on the cosmos: "Next Tuesday · How to sell event tickets online" | **W1-L38** Next Tuesday: tickets, group registrations and coupons. |
| 6:54 | B | Bujji salutes, jets up; wordmark lockup | **W1-L39** This is Bujji, signing off. See you among the stars! |
| 7:10 | T | End screen 20 s: "What is Unifesto?" + Subscribe, on the cosmos | (music out) |

**B-roll if a take is short:** content-bank/w1 `01-dashboard.jpg`, `03-iam-roles-matrix.jpg`, `06b-event-team-role-picker.jpg`, inside `panel()` with a slow zoom.

## Cuts from this video

| Cut | From | Length | Goes to |
|---|---|---|---|
| Short 1 "Should your gate volunteer see your bank details?" | 2:50–4:05, reframed 9:16 on the keycards | 45 s | `04-shorts.md` |
| Short 2 "Every event gets its own team" | 4:05–5:14 | 40 s | `04-shorts.md` |
| LinkedIn video (16:9, about 73 s) | 0:00–0:22 (hook) + 2:57–3:40 (spreadsheet split + keycards) + 5:58–6:06 (payoff) | about 73 s | `05-linkedin.md` |
| How-to carousel | chapters 1–5 | 8 slides | `assets/howto-carousel.json` |
| Thumbnail | Bujji + payoff line | | `assets/thumbnail-bujji.jpg` (A), `assets/thumbnail.png` (B) |

---

## YouTube upload (P19)

**Title** (60 characters, query first):
How to run a college club: your Space and team in 10 minutes

**Description:**

```
How to run a college club that survives your president graduating: one Space, your team, clear roles and a crew for every event.
Request a Space for your club (free to start): https://www.unifesto.app/request-space?utm_source=youtube&utm_campaign=v5-w1

Then hand the club to next year's lead, with every event and report kept. Free RSVP events carry no fees.

All links: https://www.unifesto.app/links?utm_source=youtube&utm_campaign=v5-w1
Pricing: https://www.unifesto.app/pricing?utm_source=youtube&utm_campaign=v5-w1
The 8-week checklist for organizing a college fest: https://www.unifesto.app/blog/how-to-organize-a-college-fest?utm_source=youtube&utm_campaign=v5-w1

Chapters
0:00 Your club shouldn't graduate with your president
0:40 Set up your club's Space
1:50 Add your core team
2:50 Roles: who can do what
4:05 A crew for every event
5:20 Hand the club to next year's lead
6:07 Recap and next step

Everything on screen is a demo Space (Aurora Tech Club) with sample data.

Unifesto is an event platform built in India for clubs, communities, colleges and startups. Organisers run tickets, QR check-in, payouts, certificates and hackathons from one Space. Attendees use the free Unifesto app.

#collegeclub #collegefest #unifesto
```

**Before upload:** re-time every chapter against the final cut (TTS and the edit will shift them). First chapter must stay 0:00 and every chapter at least 10 s, or YouTube drops them all.

**Tags:** how to run a college club, college club management, college club, student club, run a club, club president, club handover, college fest, event team, club roles, unifesto, unifesto space, india college events

**Thumbnail (A/B with YouTube "Test & compare"):** A = `assets/thumbnail-bujji.jpg` (3840x2160, Bujji + "Your club survives graduation." on the club orbit, from `~/Startups/unifesto-video/src/thumbnail_w1.py`). B = `assets/thumbnail.png` (same hook on the Space dashboard phone, `assets/thumbnail.json`).
**Captions:** upload the SRT from the kit timeline (the "Bujji says" column), not auto-captions.
**End screen:** "Subscribe" + "What is Unifesto?". **Card** at 0:22: "What is Unifesto?" (Bujji's first video).
**Pinned comment:** "Which ring does your club struggle with most: Space, team, roles, event crews or the handover? Tell us below and we'll answer every one. Request a Space for your club: https://www.unifesto.app/request-space?utm_source=youtube&utm_campaign=v5-w1"
**Visibility:** Public, not "Made for kids". Category: Education.
