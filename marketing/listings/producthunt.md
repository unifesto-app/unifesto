# Product Hunt launch, Wed 2 Dec 2026 (P18)

Launch on the same day as 5.0.0. Product Hunt's day runs on Pacific time; on 2 Dec the US is on standard time (DST ends 1 Nov), so **12:01 AM PST = 13:31 IST**. The PH day ends at 13:30 IST on Thu 3 Dec. The 5.0.0 store release and site update go out in the IST morning first (P9 order), so the product is live before the PH page is.

Checked 2026-10-18. Claude did not sign up or post anything; you do every step.

## At a glance

| | |
|---|---|
| Submit | https://www.producthunt.com/launch, then Submit > New product (drafts auto-save) |
| Guide | https://www.producthunt.com/launch/preparing-for-launch |
| Account type | Personal maker account (company accounts cannot post). Self-hunting is fine; a big-name hunter gives no advantage |
| Cost | Free. Ignore paid "launch services" |
| Schedule | Up to 1 month ahead, so book 2 Dec from about **2 Nov** |
| Featuring | Moderators pick what gets featured; unfeatured launches get almost no traffic. Criteria: useful, novel, well made |
| Votes | Never ask anyone to upvote. Ask them to visit and comment. Votes from brand-new or inactive accounts count for little |

## 1. Maker account warm-up (starts this week)

Votes and comments from a fresh, empty account carry little weight, and some reports say an account must be at least a week old to launch. Give it about 30 days of real activity.

| When | Do |
|---|---|
| This week (by 25 Oct) | Create a personal PH account (Abhinavtej, with `abhinavtej@unifesto.app` or Google). Finish onboarding. Real photo, headline "Building Unifesto, event platform for clubs and communities in India", link www.unifesto.app and X @unifestoapp. Follow the Events, Productivity and Developer Tools topics. |
| This week | Ask the co-founder(s) and 1 or 2 teammates to do the same; they will be listed as makers. |
| 19 Oct to 30 Nov, 10 minutes a day | Browse the day's launches. Upvote only what you actually like. Leave 2 or 3 thoughtful comments a week on launches you used (event tools, student tools, Indian startups). Aim for 10+ real comments by 1 Nov. |
| Late Oct | Create the Unifesto product page draft (fields below) and keep it as a draft. |
| 2 Nov | Schedule the launch for Wed 2 Dec, 12:01 AM PT. Once scheduled, the page can be shared so people can follow it. |
| W5 teaser (late Nov) | Put the PH page link in the W5 countdown posts ("We launch on Product Hunt on 2 Dec. Come say hi"). |

Do not: buy upvotes, join vote-exchange groups, create extra accounts, or DM people "please upvote". All of these get launches removed.

## 2. Product page fields (paste-ready)

| Field | Paste |
|---|---|
| Name | Unifesto |
| Tagline (≤60) | Tickets, QR check-in and payouts for events in India |
| Backup taglines | Run college fests, meetups and hackathons from one Space (56) · One Space for tickets, check-in and payouts in India (52) |
| Website | https://www.unifesto.app (no UTM, no short link) |
| Extra links | App Store https://apps.apple.com/in/app/unifesto-discover-events/id6767165496 · Google Play https://play.google.com/store/apps/details?id=com.unifesto.app |
| X handle | @unifestoapp |
| Pricing | Free options available (free plan + paid plans) |
| Launch tags (up to 3) | Events, Productivity, Community (swap one for Education or Hackathons if offered) |
| Makers | Your PH username + co-founders' usernames |
| Shoutouts (up to 3, only tools we really use) | Razorpay, Expo, WhatsApp (change to what is true) |
| Promo (optional) | Launch pricing: Pro at ₹1,499/month instead of ₹2,999 for Spaces that join before 31 March 2027. Code: none needed. Expiry: 31 Mar 2027 |

**Description (≤500 chars; the first 260 show in previews):**

> Unifesto is an event platform for clubs, communities, institutions and startups in India. Sell tickets, scan QR passes at the gate and get paid, all from one Space for your whole team. Free RSVP events cost nothing; paid tickets carry 2.5% on the free plan. It also runs hackathon judging, certificates with public verification and sponsor lead capture. Attendees carry their pass in the free iOS and Android app. Built in Hyderabad. INR only for now.

(451 characters. Check it in the form; trim the last sentence first if it is over.)

## 3. Gallery

| Slot | Size | File |
|---|---|---|
| Thumbnail (required) | 240x240, <3 MB, square | `websites/web/public/press/app-icon-dark-rounded-1024.png` scaled to 240x240 (a GIF only animates on hover; a still icon is fine) |
| Video (optional, YouTube only, public) | | 5.0.0 launch video from P0 on https://www.youtube.com/@unifesto-app |
| 1 | 1270x760 | Hero: "Tickets, check-in and payouts in one Space" with `content-bank/w1/01-dashboard.jpg` |
| 2 | 1270x760 | "Know your money" with `content-bank/w4/01-finance-money-flow.jpg` |
| 3 | 1270x760 | "Scan at the gate" with `content-bank/w5/03-checkin-scanner-recent-mobile.jpg` + `w5/08-checkin-stats.jpg` |
| 4 | 1270x760 | "Judge a hackathon without a spreadsheet" with `content-bank/w3/13-leaderboard-idea-pitch.jpg` |
| 5 | 1270x760 | "Your whole team, with roles" with `content-bank/w1/03-iam-roles-matrix.jpg` |
| 6 | 1270x760 | "Tickets that sell themselves" with `content-bank/w2/01-aurora-fest-ticket-types.jpg` |
| 7 | 1270x760 | Pricing card: Free RSVP · Starter ₹0 + 2.5% · Pro ₹1,499 + 1.5% · Enterprise 1% |
| 8 | 1270x760 | Attendee app: `content-bank/w2/09-group-seats-mobile.jpg` or a 5.0.0 app screenshot |

Make them with the `thumbnail` template in `marketing/templates` (cosmos look, Michroma headline). The template renders 1280x720; for PH, add a 1270x760 size to it or pad the render to 1270x760 on black. Crop `demo.N@example.com` emails and `demo_pay_` IDs out of every shot (`content-bank/INDEX.md`). Desktop shots are only 800x500, so frame them at native size in the browser frame rather than stretching them.

## 4. First comment from the maker (post the minute it goes live)

> Hi Product Hunt, I'm Abhinavtej, one of the people building Unifesto in Hyderabad.
>
> <Two or three true sentences on why you started: what you saw at Malla Reddy University or your own events. Write it yourself; don't use an invented story. Example shape: "We started at <place> after running <event> on <tools>, and <what went wrong>.">
>
> Unifesto is one Space for the whole organising team:
> - Tickets: free, paid and group, with custom questions, coupons and waitlists
> - Check-in: Crew scan QR passes from the app at the gate, lunch and kit counters
> - Money: Razorpay payments, payouts to your bank, and a financials view that shows collected, fees and net per event
> - Hackathons: Unifesto Sprint for teams, rubric rounds, judges, help desk and a live leaderboard
> - Certificates with public verification links, and sponsor lead capture
>
> Free RSVP events cost nothing. Paid tickets carry 2.5% on the free plan.
>
> What we don't do yet: payments outside India (INR only), live polls and Q&A. Both are on the list.
>
> If you run events for a club, community or college, I'd love to hear what breaks for you on event day. I'll be here all day answering.

## 5. Launch day, Wed 2 Dec (IST)

| Time (IST) | Do |
|---|---|
| Morning | 5.0.0 store release and site update (P9). Check www.unifesto.app and the store pages load. |
| 13:00 | Everyone on the launch team online. Phones charged. PH page link ready. |
| 13:31 | Launch is live. Post the first comment immediately. |
| 13:35 | Post on LinkedIn (founder + company), X, Instagram story, YouTube community: "We're live on Product Hunt today. Come tell us what you think" + link. No "upvote" wording. |
| 13:45 | WhatsApp the people in the list below, personally, one by one (no broadcast blast). |
| 13:30 to 01:00 | Reply to every PH comment within 30 minutes, with a real answer. US morning starts around 18:30 IST; stay on until at least 01:00. |
| Thu 3 Dec, 09:00 to 13:30 | Last stretch: thank commenters, answer stragglers. |
| Thu 3 Dec, after 13:30 | Post results honestly (rank or not). Add the PH badge to the site only if featured. Note the URL on the P18 board task. |

## 6. Who to tell (personal messages, not a blast)

1. Organisers who ran events on Unifesto (the `review-ask.md` list first), and admins of the 70 live Spaces you have contact with
2. Club leads and faculty coordinators at Malla Reddy University
3. The team, friends of the team who already use PH
4. Hyderabad communities: Hyd Tech Events (hydevents.substack.com), eChai Hyderabad, GDG Hyderabad organisers
5. LinkedIn, Instagram, X, YouTube followers (one post each, as above)
6. Anyone who followed the scheduled PH page after the W5 teaser

Message (WhatsApp, personal):

> Hi <name>, we launched Unifesto on Product Hunt today: <link>. If you've used it for <event>, a comment there on what worked or didn't would mean a lot. Takes a minute.

## Featuring checklist (moderators look at these)

- [ ] Real product, live, no waitlist (yes)
- [ ] Clear tagline that says what it does (no slogans)
- [ ] Gallery shows the real UI
- [ ] First comment with the story and honest limits
- [ ] Makers answer every comment
- [ ] Engagement from accounts with history, not new accounts
