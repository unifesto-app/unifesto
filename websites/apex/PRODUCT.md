# Apex — Unifesto Control

Apex is the unified operator console for the Unifesto platform. It replaces two
separate dashboards (the internal **Admin** console and the **Organiser** console)
with a single, role-aware application. One person signs in; Apex shows them the
surface that matches who they are.

## Who it's for

Two audiences share one shell:

- **Platform staff** — Unifesto's own admins and super-admins. They run the
  platform: watch the numbers, moderate content, manage users and spaces,
  approve payouts, keep the lights on. Their mode is *operational calm* — they
  are fluent, they are here often, they need density and precision, not
  hand-holding.
- **Organisers** — student club leads, fest committees, community organisers.
  Many are first-timers who are a little nervous. They create spaces and events,
  sell tickets, check people in, and get paid. Their mode is *guided
  confidence* — they should always know what to do next and never feel lost.

## North Star

**Mission control that also coaches.** Apex is the room where the whole platform
is visible and controllable — but it never dumps that complexity on someone who
just wants to run their first event. The interface earns trust the way Linear,
Stripe, and Notion earn it: the tool disappears into the task.

## Jobs to be done

**Admin jobs**
- *Watch the platform.* See users, spaces, events, registrations, revenue at a
  glance and drill into anything.
- *Moderate & operate.* Review flagged content, audit actions, manage roles,
  handle transactions, payouts, redeem codes, and infra.
- *Trust the data.* Every number is legible, sourced, and never ambiguous.

**Organiser jobs**
- *Get to first success fast.* Create a space, launch an event, sell a ticket
  with the fewest possible detours.
- *Run the event.* Manage tickets, attendees, check-in, communications, and
  analytics from one place.
- *Get paid.* Track registrations and request payouts with total clarity on
  status.

## Personality

Sleek, precise, and quietly encouraging. Apex is a *capable* tool — it respects
that admins are experts, and it *guides* organisers who aren't. It celebrates
earned progress (a completed setup step, an approved event) without ever being
loud or cute. It is calm under load: state is always explicit — loading,
empty, error, success are designed, never left to chance.

## Principles

1. **Show the right surface.** Role decides the app. Admins get density and
   control; organisers get guidance and encouragement. Never show someone a door
   they can't open.
2. **Guide, don't dump.** Especially for organisers — one clear next step per
   view, progressive disclosure over walls of options.
3. **State is never ambiguous.** Skeletons for loading (not spinners mid-content),
   empty states that teach the interface, honest error states.
4. **One blue leads the way.** Unifesto Blue (`#1a75ff`) is reserved for the
   primary action / current selection / key state — never decoration, ≤10% of any
   view (the *Wayfinding Blue Rule*).
5. **Green celebrates progress.** Success green marks *earned* completion only —
   a finished step, an approved event (the *Celebrate-Progress Rule*). Admins
   rarely see it; organisers see it when they win.
6. **Consistency over surprise.** The same button, the same form control, the
   same icon style everywhere. Delight lives in moments, not on every page.
7. **Light-mode only, WCAG 2.1 AA.** A bright, trustworthy operator surface;
   `prefers-reduced-motion` always honoured.

## Anti-references (what Apex is NOT)

- **Not a generic college portal.** No clip-art, no rainbow tabs, no clutter.
- **Not Eventbrite.** We are the operator's back-of-house, not a consumer
  ticket storefront.
- **Not corporate SaaS wallpaper.** No gradient hero, no glassmorphism, no
  decorative motion. Earned familiarity, not template gloss.
- **Not two apps bolted together.** Admin and Organiser share one design
  language, one shell, one vocabulary — the difference is what you're *allowed*
  to do, not how it *feels*.

## The tech it lives on

Next.js 16 (App Router) · React 19 · Tailwind CSS v4 · TypeScript. Authenticated
against the Unifesto NestJS backend via a JWT (`unifesto_token` cookie), with a
role-aware shell that renders admin or organiser navigation from the user's
platform role. Fonts: **Agrandir** (all UI). Wordmark uses the Unifesto brand
mark.
