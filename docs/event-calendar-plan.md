# Event Calendar — Plan

Status: **DISCUSSION / PLANNING** (not started). Date: 2026-09-14.

Bring a full event-calendar capability to Unifesto across attendees (web + mobile),
operators (space app) and platform admins (apex), spanning three flavors:
add-to-calendar export, "my registered events", and calendar **grid views** — with
**full per-occurrence recurrence**.

---

## Locked decisions

These were decided in the planning discussion and should not be re-opened without cause.

1. **Scope = all three flavors, all three audiences.** Export + "my events" + grid
   views; attendees (web+mobile), operators (space), platform (apex).
2. **Grid rendering = hand-rolled CSS grid** in the React apps (no FullCalendar /
   react-big-calendar). Matches the design-token system already in flight
   (see `[[space-page-redesign]]`, `[[space-nav-revamp]]`). Mobile uses its own RN grid.
3. **Recurrence = full per-occurrence** (each occurrence independently registerable,
   with its own capacity, tickets, and check-in).
4. **Occurrence model = Model A: an occurrence IS an `Event` row**, materialized from
   an RRULE on a *series-parent* Event. Registration / capacity / tickets / check-in /
   payments / waitlist / certs / reports keep working unchanged because they already
   key on `Event`. Complexity lives in series generation + edit-scope, NOT in the
   money code.
5. **Ticket types & capacity = template → copied to each occurrence.** Authored once
   on the series; the engine copies onto every generated occurrence; occurrences may
   diverge afterward.

### Key facts established during discovery

- `Event` is already calendar-ready: `startDateTime`/`endDateTime` are `Timestamptz(6)`
  with a per-event `timezone`, plus `status`, `visibility`, `category`, `city`, `type`.
- **No calendar anything exists today** — no ICS export, no Google/Outlook links, no
  grid view in any frontend. Events surface only as lists (`/events` with a
  `DATE_FILTERS` dropdown, space `/dashboard/events`, apex admin).
- `recurringRule` / `isRecurring` are **dead columns** — never written by any DTO,
  create, or update path; no RRULE or ICS library installed anywhere. Recurrence is
  built from scratch.
- The **sub-event hierarchy** (`parentEventId` / `EventHierarchy`, "one level deep,
  same space") is the existing per-occurrence primitive we're modeling recurrence on —
  but recurrence gets its **own distinct relation**, it does NOT overload sub-events.

---

## Remaining decisions (recommendations — please confirm)

**D1. Series ↔ occurrence relation.** Add a *new* self-relation on `Event`
(`seriesParentId` / `EventSeries`), separate from `parentEventId`/`EventHierarchy`.
An occurrence points at its series-parent; the series-parent is a non-registerable
template. **Recommendation:** for v1, forbid an event being *both* a recurring series
and a festival sub-event (keep the two hierarchies from crossing).

**D2. Generation horizon.** "Weekly forever" can't be fully materialized.
**Recommendation:** materialize a **rolling window** — the sooner of `UNTIL`/`COUNT`
or ~next 12 months — and extend it with a daily cron (reuse the `event-scheduler`
pattern already in the events module).

**D3. Edit-scope semantics** (the genuinely hard UX). Editing a series offers the
standard three scopes: **this occurrence / this-and-following / whole series**.
**Recommendation:** v1 supports *this occurrence* (detach + edit one row) and *whole
series* (regenerate future, unmodified rows; never touch past or already-registered
occurrences). Defer *this-and-following* if it slips.

**D4. Registration safety on regeneration.** Never delete/move an occurrence that has
registrations or payments. **Recommendation:** regeneration only adds future rows and
edits untouched future rows; occurrences with any registration are frozen and edited
individually.

**D5. Timezone display.** ICS carries tz correctly regardless. **Recommendation:**
grids render in the **viewer's local tz** for attendees, in the **event's tz** for
operators/apex (planning context).

---

## Shared foundation (built first, reused everywhere)

- **A. ICS generator** — one util `Event → VCALENDAR/VEVENT` honoring `timezone`,
  venue vs `onlineUrl`, description, organiser. Emits RRULE for series. Backs export
  links, the email attachment, and the subscribable feeds. Library: `ics` or
  `ical-generator` (backend). RRULE parsing/expansion: `rrule`.
- **B. Range read-model** — a new overlap query ("every event in `[from,to]`"),
  distinct from the paginated `getEvents`, with three visibility-scoped entry points:
  - public: `GET /events/calendar?from&to&city&category&type` (PUBLIC + PUBLISHED)
  - space: `GET /events/calendar/space/:id?from&to` (`@Can` gated; incl. DRAFT,
    sub-events, optionally Sessions)
  - apex: `GET /admin/calendar?from&to` (all spaces)
- **C. Per-user feed token** — the *only* genuinely new persisted data. A stable,
  revocable token (calendar clients poll the `.ics` for months, unauthenticated).
  New column/table on `User`; regeneration invalidates old subscriptions.

---

## Phases

### P1 — Foundation + Add-to-calendar export
- ICS util (A); `GET /events/:id/calendar.ics` (respects visibility).
- Google Calendar + Outlook deep-link builders (frontend, pure URL construction) on
  the web `/event/[slug]` page and mobile event/ticket detail.
- Attach the `.ics` to the registration confirmation email.
- *No new UI framework; ships attendee value fast; proves the ICS util.*

### P2 — Recurrence engine (the heavy backend lift; unblocks true per-occurrence grids)
- New `seriesParentId`/`EventSeries` relation + `recurrenceRule` wiring (retire or
  repurpose the dead `recurringRule`/`isRecurring`) + migration.
- RRULE authoring in the event create/edit wizard (space app).
- Generation + reconciliation service (materialize child Event rows, copy ticket
  template per D5, rolling-window cron per D2, edit-scope per D3, freeze-registered
  per D4).
- ICS emits RRULE for series.

### P3 — "My registered events"
- Feed token (C) + `GET /users/me/calendar.ics?token=…` (subscribe once, always
  current) + a "my events" view. Reuses A.

### P4 — Grid views (hand-rolled, one audience at a time on read-model B)
1. **Space app** — operators plan / avoid clashes; smallest, safest audience; app
   already being redesigned.
2. **Public web + mobile** — attendee discovery ("what's on this month").
3. **Apex** — cross-space oversight (re-skin of the space grid over the all-spaces
   query).

> Ordering note: P1 first (fast value, de-risks ICS). P2 before P4 because a
> per-occurrence grid needs occurrences to exist. P3 can slot in parallel after P1.

---

## P1 — concrete scope (add-to-calendar export)

Independent of every open decision (D1–D5); safe to build first.

### Discovery facts that shape P1
- Public event fetch is `GET /events/:slug` → `EventsService.getEventBySlug`, which
  already `include`s `space {name, slug}` and `creator {fullName}` plus the top-level
  `title, description, startDateTime, endDateTime, timezone, venueName, venueAddress,
  city, onlineUrl, slug, type`. **Everything the ICS needs is already loaded.**
- The `:slug` route is single-segment, so `GET /events/:slug/calendar.ics`
  (two-segment) does **not** collide with it — no route-order gotcha.
- Transactional emails send via **Resend** (`sendViaResend`), whose `emails.send`
  accepts an `attachments: [{filename, content}]` field — so attaching the `.ics` is a
  small extension of that one method. SES path (OTP/bulk) needs no change.
  NOTE (email.service.ts:812): certificates are sent as links "no attachment support
  needed" — P1 is what *adds* attachment support to the Resend transport.
- Web event page = `event/[slug]/EventDetailClient.tsx` (already has share buttons) and
  a post-register `event/[slug]/register/success/page.tsx` — two natural button homes.
- Mobile detail = `app/event/[id].tsx`; `Linking.openURL` already used elsewhere → a
  Google Calendar deep link works with **no native rebuild**. (Writing to the device
  calendar via `expo-calendar` would need a native rebuild + permission — defer.)

### Deliverables
1. **`ics.util.ts`** — pure `Event → VCALENDAR` string, RFC-5545 correct (TZID from
   `event.timezone`, escaping, stable UID). *Field-mapping is the one real decision —
   see `buildEventIcs` TODO in the scaffold.*
2. **`GET /events/:slug/calendar.ics`** — public route on `EventsController`; reuse
   `getEventBySlug`, guard visibility (`PUBLIC` + `PUBLISHED` only, else 404), respond
   with `Content-Type: text/calendar; charset=utf-8` + `Content-Disposition`.
3. **Pure link builders** (frontend, no backend) — `googleCalendarUrl(event)` and
   `outlookCalendarUrl(event)` from event fields; used on web + mobile.
4. **Web** — an "Add to calendar" control (Google / Outlook / .ics) in
   `EventDetailClient.tsx` and on the register `success` page.
5. **Mobile** — same three options on `app/event/[id].tsx` via `Linking.openURL`.
6. **Email** — extend `sendViaResend` with optional `attachments`; attach the event
   `.ics` to `sendRegistrationConfirmation` (+ a "Add to calendar" link row).

### P1 decisions (recommendations)
- ICS keyed by **slug**, not id (matches the public page, human-shareable).
- **Timed** VEVENT with `TZID=<event.timezone>` (never all-day; never bare UTC — keeps
  the attendee's local reminder correct).
- `LOCATION` = venue address for `IN_PERSON`/`HYBRID`, else the online URL; the *other*
  channel goes in `DESCRIPTION` alongside a link back to the event page.
- Mobile P1 = deep-link + `.ics` open only (no `expo-calendar`, no native rebuild).

### Effort / risk
Small. No schema change, no migration. New backend dep: an ICS lib **or** hand-write
the string (the scaffold hand-writes it — ~40 lines, zero deps). Rebuild backend + web
+ mobile. Fully shippable on its own ahead of P2–P4.

## Deploy notes (per repo conventions)
- Prisma: expand migration for `EventSeries` relation + feed token; `migrate deploy`.
- Rebuild: backend + space (P2 authoring) + web + mobile + apex as each phase lands.
- New backend deps: `rrule`, an ICS lib. New env: none anticipated beyond existing
  `PUBLIC_API_URL` for absolute ICS/feed URLs.
