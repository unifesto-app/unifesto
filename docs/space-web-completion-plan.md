# Space web completion: cosmos theme + mobile parity

Goal: `websites/space` (space.unifesto.app) reaches feature parity with the mobile
manage screens (`mobile/app/manage/**`) and wears the monochrome cosmos brand
(the web's `websites/web/src/app/globals.css`, also ported to mobile in
`mobile/src/theme/cosmos.ts`).

Started 2026-10-09 on branch `claude/space-cosmos`.

## Phase 1: cosmos theme (DONE, this branch)

Token-level swap, so all ~48 pages change with almost no page edits.

- `app/globals.css`: the `:root` HSL tokens are now cosmos (black ground, `#ececee`
  ink, starlight-silver primary with black type). Light set via
  `prefers-color-scheme: light` flips the same roles, like the web's
  `[data-theme="light"]`. Green, amber and red are kept for state only.
- Fonts: Agrandir → Hanken Grotesk (UI) + Michroma (`font-display`, page titles via
  `PageHeader`) + Martian Mono, same as unifesto.app.
- `.wordmark` utility draws the PNG wordmark in the current ink (login, no-access,
  shell, sponsor portal).
- Hardcoded `green-50`/`amber-50`/`hsl(358 …)` classes moved to the
  `success`/`warning`/`destructive` tokens. Finance charts read the CSS vars.
- Kept intentionally white or black: sponsor logos on white tiles, the certificate
  canvas, the email preview iframe, and image-crop backdrops.

Not done: a manual theme toggle. The app follows the OS setting; add a toggle when
someone asks for one.

## Gap audit: mobile manage screens with no space-web page

| Area | Mobile screen(s) | Backend | Web phase |
|---|---|---|---|
| Space tracking | `manage/space/tracking` (SpaceTrackingScreen) | exists | 2 |
| Event tracking + links | `manage/event/tracking` | exists | 2 |
| Event partners | `manage/event/partners` | exists | 2 |
| Attendees by source | `manage/event/source` | exists | 2 |
| Per-event payout request | `manage/event/payout` (RequestPayoutScreen) | exists | 3 |
| Unifesto Stay (stays, options, bookings, booking detail, pass desk) | `manage/event/stay*`, `stays`, `stay-scan` | `/events/:id/stays*`, `/stay-bookings*`, `/stay-pass/:code` | 4 |
| Hackathon curator suite (judges, rooms, themes, statements, teams, rounds/criteria, queues, help topics, results, winners, awards, announce, certificates) | `manage/event/hackathon/**` (19 screens) | exists | 5, needs a decision |

Already at parity: members, sub-spaces, settings, billing, white-label, sponsors and
tiers, leads, financials/payouts/refunds/bank accounts, support, event tickets,
attendees (add, import, detail), check-in, coupons, waitlist, RSVPs, WhatsApp,
co-hosting, content, sub-events, occurrences (mobile "series dates"), team,
certificates, reports, transactions, settings.

## Phase 2: tracking and partners
Space tracking page in the "Grow" nav group; event Tracking + Partners tabs in
`EventNav`; source drill-down linking to the existing attendee detail.

## Phase 3: per-event payout request
A "Request payout" action on the event money view, reusing `components/finance`.

## Phase 4: Unifesto Stay
Event "Stay" section: stays list/editor (cover, gallery, options, questions),
bookings queue with approve/reject/mark-paid/check-in/out, and a pass desk
(typed pass code; add camera scan only if desks ask for it).

## Phase 5: hackathon curator suite (decision needed)
`docs/hackathon-dashboard-plan.md` deliberately put curator management in
**mobile only** ("Websites are not extended"). Porting the 19 screens reverses
that. Confirm before starting; if yes, start with teams + judges + results.
