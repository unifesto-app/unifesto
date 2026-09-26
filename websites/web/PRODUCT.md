# Product

## Register

brand

## Users

Unifesto serves two audiences on one platform, and design work spans both a public
marketing site (brand) and the in-app experience (product). PRODUCT.md defaults to
`brand` because most surfaces in focus are the public site and conversion flows, but
the product side is first-class — override the register per task when working inside
the app shell.

- **Students (primary consumer).** College students in India — the platform launched at
  Malla Reddy University, Hyderabad and is expanding campus by campus. Context: on their
  phone, between classes or in the hostel, discovering what's happening on campus.
  Job-to-be-done: find events worth their time, register in seconds, check in without
  friction (AI face check-in), and keep everything in one wallet. WhatsApp-first, mobile-first.
- **Organisers (primary producer).** Student clubs, fest teams, and event leads — "built by
  struggled event organisers." Context: running an event under deadline pressure with a
  volunteer team. Job-to-be-done: host and publish an event, manage registrations and
  check-in, and get post-event intelligence (analytics/debrief) without stitching together
  spreadsheets and group chats.

## Product Purpose

Unifesto is the AI brain behind student-led campus events in India. It unifies event
discovery, registration, AI-powered check-in, WhatsApp-first communication, and post-event
analytics into one platform — replacing the scattered mix of forms, spreadsheets, posters,
and group chats that campus events currently run on.

Success looks like: a student discovers and registers for a relevant event in under a
minute and checks in with their face; an organiser launches an event and walks away with
real attendance data and an AI debrief; and each new campus onboards because the last one
made it look effortless. The public site's job is to make both audiences believe that
promise on first scroll.

## Brand Personality

Sleek, dark, AI-premium. Confident and modern without being cold — this is a student
product that happens to look like a serious tech company, not a college portal that got a
theme. Voice is direct and a little proud ("built by struggled event organisers"), speaks
to campus India specifically, and leans on real numbers (10K+ students, 93% check-in) over
vague hype. Electric, high-contrast, and fast — the interface should feel like the platform
already runs your whole event.

Emotional goals: **confidence** (this is the real, capable tool), **momentum** (things move
fast here), and **belonging** (this was made for our campus, by people like us).

## Anti-references

- **Not a generic college portal.** No institutional blues-and-whites, no dated dashboards,
  no "student information system" energy. It should never look like software the university
  administration bought.
- **Not cluttered / Eventbrite-y.** No dense listing walls, no ad-heavy discovery, no
  generic marketplace chrome. Discovery should feel curated and AI-matched, not endless.
- **Not corporate SaaS.** Avoid the navy-and-gray B2B template, the hero-metric cliché, the
  identical feature-card grids, and the tiny tracked eyebrow above every section. Premium,
  but with student energy — not enterprise sameness.

## Design Principles

- **Show the intelligence, don't just claim it.** "AI brain" is the promise — surface it
  through real behavior (matched events, face check-in, debrief) and concrete proof, not
  buzzword badges.
- **Proof over hype.** Lead with specific numbers and named campuses. Every bold claim earns
  its place with evidence a skeptical student or organiser would trust.
- **Mobile-first, WhatsApp-native.** The real user is on a phone. Design the small screen
  first; the desktop site is the aspirational shopfront, the phone is where the job happens.
- **One system, two audiences.** Student discovery and organiser tooling share a visual
  language. Neither should feel bolted on; the brand carries across marketing and app.
- **Fast and high-contrast.** Momentum is a feeling. Snappy motion, decisive contrast on the
  black canvas, and no dead weight — the interface should feel as quick as the platform claims to be.

## Accessibility & Inclusion

- Target **WCAG 2.1 AA**. On the pure-black (#000000) canvas, verify every text/background
  pair hits contrast: body ≥4.5:1, large/bold text ≥3:1. Watch the muted slate grays
  (`slate-400`) on black for small text — bump toward lighter slate where they fall short.
- **Respect reduced motion.** The site uses glow pulses, beams, floats, and fade-in-up
  reveals; every one needs a `@media (prefers-reduced-motion: reduce)` alternative
  (crossfade or instant). Reveals must enhance already-visible content, never gate it.
- **Don't rely on the blue accent alone** to carry meaning (state, links, emphasis) — pair
  with weight, underline, icon, or label so color-blind users aren't lost.
- **Mobile & touch first.** Adequate tap targets, readable sizes without zoom, and layouts
  that hold up on small Indian-market Android devices and slower connections.
