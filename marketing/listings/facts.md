# Unifesto listing facts (P18)

One source of truth for every review site, directory and community profile. Every site file in this folder pastes from here. Facts come from `websites/web/src/lib/site.ts` (`SITE`, `PLANS`, `PROOF`, `SOCIAL`) and match the P17 profile copy on LinkedIn, Crunchbase and Instagram. If `site.ts` changes, change this file first, then the live listings.

Rules: no em dashes, organiser-first, only features that are live in production, honest about gaps.

## Identity

| Field | Value |
|---|---|
| Product name | Unifesto |
| Company | Unifesto Private Limited |
| Website | https://www.unifesto.app |
| Founded | 2025 |
| Headquarters | Hyderabad, Telangana, India |
| First campus | Malla Reddy University, Hyderabad |
| Market | India (prices and payments in INR) |
| Platforms | Web (www.unifesto.app, www.unifesto.app/console), iOS, Android |
| Support email | support@unifesto.app |
| Support / WhatsApp | +91 93460 95136 |
| General phone | +91 97030 45690 |
| Tagline (brand) | Optimize. Organize. Elevate. |

## Links

| Where | URL |
|---|---|
| Website | https://www.unifesto.app |
| Organiser console | https://www.unifesto.app/console |
| Pricing | https://www.unifesto.app/pricing |
| Request a Space (signup) | https://www.unifesto.app/request-space |
| Press and brand kit | https://www.unifesto.app/press |
| App Store | https://apps.apple.com/in/app/unifesto-discover-events/id6767165496 |
| Google Play | https://play.google.com/store/apps/details?id=com.unifesto.app |
| Instagram | https://www.instagram.com/unifesto.app/ |
| LinkedIn | https://www.linkedin.com/company/unifesto |
| X | https://x.com/unifestoapp |
| YouTube | https://www.youtube.com/@unifesto-app |

## Copy

**One-liner (≤90 chars, use everywhere a short line is asked for)**

> Unifesto is an event platform for clubs, communities, institutions and startups in India.

**Tagline (≤60 chars)**

> Tickets, QR check-in and payouts for events in India

**Short description (≤160 chars)**

> Event platform for clubs, communities, institutions and startups in India. Tickets, QR check-in, payouts, certificates and hackathon judging in one Space.

**Medium description (≤300 chars)**

> Unifesto is an event platform for clubs, communities, institutions and startups in India. Organisers run ticketing, QR check-in, payouts, certificates, sponsors and hackathon judging from one Space. Attendees register and carry their pass in the free Unifesto app.

**Long description (about 1,000 chars, plain paragraphs, no pricing, safe for strict forms such as Crunchbase)**

> Unifesto is an event platform for clubs, communities, institutions and startups in India. Organisers run ticketing, QR check-in, payouts, certificates, sponsors and hackathon judging from one Space. Attendees discover events, register and carry their pass in the Unifesto app.
>
> A Space holds your whole team. Add Curators, Co-Curators and Crew, each with their own permissions. Sell free, paid and group tickets through Razorpay, ask custom registration questions, run waitlists and coupons, and scan passes at several check-in points from the app. Payouts, refunds and a financials view show what you collected, what you paid in fees and what you take home.
>
> Unifesto Sprint runs hackathons: teams, problem statements, rubric rounds, judge panels, a help desk and a live leaderboard. Unifesto Stay handles event accommodation and Unifesto Huddle runs paid online sessions.
>
> Built in Hyderabad, India. As of October 2026: 10,000+ people checked in, 25+ events, 70 live Spaces.

**Numbers line (only where numbers are allowed; dated, never undated)**

> As of October 2026: 10,000+ people checked in, 25+ events, 70 live Spaces.

Source: `PROOF` in `site.ts` (spacesLive 70 since PR #176). Attendee and event totals are the founders' figures. Most live Spaces are institution Spaces the team set up; do not call them "70 customers".

## Categories

Primary: Event Management Software. Secondary, where a site allows several: Event Registration Software, Event Ticketing Software, Event Check-in Software, Hackathon Software, Conference Management Software.

Audience: college clubs and fest teams, student communities, institutions (universities with many departments), tech communities, startups running meetups and hackathons. Company size: 1 to 1,000+. Industry: Education, Events Services, Non-profit, Technology.

## Pricing (launch pricing for Spaces that join before 31 March 2027)

All prices exclude 18% GST. Razorpay payment gateway charges are separate from the Unifesto platform fee. Free RSVP events cost nothing on any plan.

| Plan | Price | Platform fee per paid ticket | Standard price after launch offer |
|---|---|---|---|
| Starter | ₹0 / month | 2.5% | ₹0, 4% |
| Pro | ₹1,499 / month (₹1,199 / month billed annually) | 1.5% | ₹2,999, 3% |
| Enterprise | Custom | 1% | Custom, 2% |

- Free plan: yes. Free trial: not needed (Starter is free). Pricing model: per month plus a percentage of paid ticket sales.
- Currency: INR only.

What each plan includes (from `PLANS`):

- **Starter:** unlimited free RSVP events with no platform fee; paid and group tickets with Razorpay; multi-point QR check-in from the app; coupons, custom questions, sub-events; payouts, refunds and financials; WhatsApp confirmations and push; Unifesto Stay (rooms, approvals, stay passes).
- **Pro:** everything in Starter; waitlists and recurring event series; certificates with public verification; sponsors, sponsor portal and lead capture; Unifesto Sprint for hackathons; Unifesto Huddle online sessions; WhatsApp blasts, analytics and PDF reports; bulk attendee export.
- **Enterprise:** everything in Pro; white-label (colour, favicon, email sender); remove Unifesto branding; sub-spaces for every department; custom limits and priority support; onboarding for your team.

## Features (live in production, October 2026)

Use this list for "features" checkboxes and bullet fields. Do not add anything that is not here.

1. Event pages with registration, custom questions (text, choice, file upload, show-if logic) and sub-events
2. Free, paid and group tickets through Razorpay, with coupons, waitlists and sale windows
3. Multi-point QR check-in from the app (gate, lunch, kit), group check-in by roster, duplicate scans flagged
4. Payouts to the organiser's bank account, refunds with two-step approval, financials per event
5. Team roles: Space Admin, Curator, Co-Curator, Crew, with an editable permission matrix
6. Certificates with a template designer and public verification links
7. Sponsors: roster, tiers, sponsor portal, booth lead capture by scan
8. Unifesto Sprint: hackathon teams, problem statements, rounds with weighted rubrics, judge panels, rooms, help desk, submissions, live leaderboard, results
9. Unifesto Stay: event accommodation, room approvals, stay passes
10. Unifesto Huddle: paid online sessions
11. WhatsApp confirmations, group invite links and push notifications; email campaigns
12. Analytics, PDF event reports, CSV / Excel / PDF exports
13. Attendee app (iOS, Android): discover events, register, carry passes, calendar reminders
14. White-label colour, favicon and email sender (Enterprise)

## Honest gaps (say these when asked, never hide them)

- INR only. Payments run through Razorpay, so it suits events in India; no multi-currency yet.
- No live polls, live Q&A or quizzes during sessions yet.
- No AI features yet.
- No badge printing.
- One shared WhatsApp sender (Unifesto's), not a bring-your-own number.
- Small team; support by email and WhatsApp, not 24/7 phone.

## Rivals (for "alternatives" fields and comparisons)

Townscript, KonfHub, Devfolio, Eventbrite, Luma. Also seen in Indian searches: Unstop, Allevents, TheCollegeFever, Google Forms (as a do-it-yourself baseline).

Fair one-line comparison (only if a site asks how we differ):

> Built for Indian clubs and institutions: one Space for the whole team with roles, a 2.5% fee on paid tickets on the free plan, QR check-in at several points, and hackathon judging in the same tool.

## Assets

| Asset | File | Size |
|---|---|---|
| Logo, square (dark app icon) | `websites/web/public/press/app-icon-dark-1024.png` | 1024x1024 PNG |
| Logo, square, rounded | `websites/web/public/press/app-icon-dark-rounded-1024.png` | 1024x1024 PNG |
| Logo, light variant | `marketing/brand-2026/png/app-icon-light-1024.png` | 1024x1024 PNG |
| Logo, vector | `websites/web/public/logos/unifesto.svg` | SVG |
| Wordmark | `websites/web/public/UnifestoAppWordmark.png` | PNG |
| Brand sheet | `marketing/brand-2026/brand-sheet.png` | 1600x1180 |
| Brand kit zip | https://www.unifesto.app/press/Unifesto-Brand-Kit.zip | |
| YouTube banner | `content-bank/youtube/channel-banner.png` | |

Screenshots: from `content-bank/` (outside the repo, not committed). Use the shots below; crop out `demo.N@example.com` emails and `demo_pay_` / `demo_order_` IDs first (see `content-bank/INDEX.md`). Desktop shots are 800x500, phone shots are 750x1624. For sites that want 1270x760 or larger, frame the shot with the `thumbnail` template in `marketing/templates` (1280x720) instead of upscaling.

Recommended order (the same five everywhere):

1. `w4/01-finance-money-flow.jpg` (money flow: collected, fees, net)
2. `w5/08-checkin-stats.jpg` (70 bookings, 61 checked in)
3. `w3/13-leaderboard-idea-pitch.jpg` (hackathon leaderboard)
4. `w1/03-iam-roles-matrix.jpg` (team roles)
5. `w2/01-aurora-fest-ticket-types.jpg` (ticket types)

Extra if a site takes more: `w2/09-group-seats.jpg` (crop emails), `w3/10-help-desk-queries.jpg`, `w5/02-checkin-points-and-crew-access.jpg`, `w2/04-registration-question-types.jpg`, `w1/01-dashboard.jpg`.

Video: the P0 launch video on https://www.youtube.com/@unifesto-app (use its YouTube URL where a site takes a video link).
