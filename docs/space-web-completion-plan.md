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
| Space tracking | `manage/space/tracking` (SpaceTrackingScreen) | exists | 2 (done) |
| Event tracking + links | `manage/event/tracking` | exists | 2 (done) |
| Event partners | `manage/event/partners` | exists | 2 (done) |
| Attendees by source | `manage/event/source` | exists | 2 (done) |
| Per-event payout request | `manage/event/payout` (RequestPayoutScreen) | exists | 3 (done) |
| Unifesto Stay (stays, options, bookings, booking detail, pass desk) | `manage/event/stay*`, `stays`, `stay-scan` | `/events/:id/stays*`, `/stay-bookings*`, `/stay-pass/:code` | 4 (done) |
| Hackathon curator suite | `manage/event/hackathon/**` | exists | 2 (done) |

Already at parity: members, sub-spaces, settings, billing, white-label, sponsors and
tiers, leads, financials/payouts/refunds/bank accounts, support, event tickets,
attendees (add, import, detail), check-in, coupons, waitlist, RSVPs, WhatsApp,
co-hosting, content, sub-events, occurrences (mobile "series dates"), team,
certificates, reports, transactions, settings.

## Phase 2: tracking, partners and Unifesto Sprint (DONE, this branch)

Shared plumbing: `lib/api/call.ts` gives the web the same `Result<T>` `call()`
contract as mobile, so `lib/api/tracking.ts`, `traffic.ts` and `hackathon.ts`
are copies of the mobile clients (hackathon trimmed to curator routes).
`components/shared/ListGroup.tsx` is the web twin of mobile's SettingsGroup.

- Tracking: space `/dashboard/tracking` (traffic, most viewed, sources with
  per-event split, short links, tagged links); event `/tracking` + `/tracking/source`
  drill-down; event `/partners`. Nav: space "Community › Tracking", event "Grow".
- Sprint (curator side of every `manage/event/[eventId]/hackathon/**` screen),
  under `/dashboard/events/[eventId]/hackathon`: hub (on/off, import teams),
  settings, teams + team + team statement, statements + editor, themes, rounds
  + round (criteria edited inline), judges/mentors + editor, panels, live queues,
  results + team results (CSV download), winners + award editor, announcements,
  help topics, help desk, rooms + room editor, certificates. Nav: event
  "Experience › Sprint" (gated `event:manage-attendees`, plan gate shown in-page).
- Live pages (round, queues, results, help desk) poll every 10 s and on focus;
  mobile uses the `/leaderboard` socket. Add socket.io-client if that's too slow.
- Judge console and team screens stay app-only.

## Phase 3: per-event payout request (DONE)
"Request payout" on the event's Transactions page (gated `space:manage-money`),
reusing the existing `RequestPayoutDialog` from `components/finance/PayoutsPanel.tsx`.

## Phase 4: Unifesto Stay (DONE)
`lib/api/stays.ts` = mobile's client trimmed to team routes (cover/gallery via
FormData). Under `/dashboard/events/[eventId]/stays`: hub (stats, property desk
pass lookup, stays list), stay editor (cover + gallery, property, dates, booking
rules, rooms and beds edited inline, questions via `FormFieldsManager` with a new
`store` prop), bookings (tabs, search, guest-list CSV) and booking detail
(approve/decline, room + team note, mark paid, check in/out, cancel with optional
refund, guest IDs through signed links). Crew (no `event:manage-attendees`) get
desk mode, as on mobile. The pass desk is typed or a handheld scanner, no camera;
add one if desks ask for it.

All mobile manage screens now have a space-web page.
