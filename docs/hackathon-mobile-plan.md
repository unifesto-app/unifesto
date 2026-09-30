# Hackathon Section (Mobile) — Plan

Status: **IN BUILD** — Phases 1–2 done (not deployed). All open questions answered 2026-09-30.
This is the **single source of truth** for hackathon work. It builds on the existing
`leaderboard` module (rounds, panels, judgments, awards, participant view), recorded in
[`hackathon-dashboard-plan.md`](hackathon-dashboard-plan.md), which has been trimmed so it
no longer conflicts with this plan.

Scope: **mobile app + backend only.** No new features in `websites/space`,
`websites/apex` or `websites/web`. The one website change is **removing** the Space web
leaderboard page (§13 Phase 6), so mobile is the only curator tool.

---

## 1. What we're building (one paragraph)

A curator turns on **Hackathon mode** for an event. Confirmed **group** registrations are
imported as **teams**; each gets a unique **Team ID** from the curator's pattern. Every
team member sees a **Hackathon hub** in the app: team ID, members, venue, allocated room,
announcements. The team then locks in a **problem statement (PS) + theme/domain** (writes
its own, picks from the curator's list, or gets one assigned). Only then does the
**Hackathon window** open: rounds, project links, and **requesting evaluation** from a
judge in a live **queue** with a timed slot. **Judges** (normal users with an event role)
call teams, run the timer, enter marks + notes against the curator's criteria, and can
edit for **5 minutes** after submitting. Marks are **never** shown to participants. The
curator configures rounds (single / panel / multi-judge, elimination on or off,
cumulative or separate scoring), advances or eliminates teams, and **declares winners
with notes**. Everything important arrives as a **push + in-app notification**.

---

## 2. Locked decisions (from the 2026-09-30 discussion)

| # | Topic | Decision |
|---|---|---|
| 1 | Enabling | Curator enables **Hackathon mode** per event; hackathon screens exist only then. |
| 2 | Teams | Only **GROUP** registrations are imported. Individual/RSVP imports are rejected server-side. |
| 3 | Team ID | **Prefix + auto number** set by curator (e.g. `HACK25-` + 3 digits → `HACK25-001`). Assigned in import order; curator may edit a single ID; **never reused**. |
| 4 | Cancellation | Registration cancelled after ID assigned → team keeps its ID and shows **Cancelled**. ID is not reassigned. Team drops out of queues/rounds. |
| 5 | Visibility | **Every team member** (lead + members who claimed their seat) sees the hackathon screens. |
| 6 | Venue & rooms | Hackathon venue shown to teams; curator creates rooms; **auto-allocate + manual edit**. |
| 7 | PS modes | Curator picks one per event: **team writes own**, **team picks from list**, **curator assigns**. |
| 8 | PS approval | **Locks on submit.** Curator can still edit/reassign later. |
| 9 | Theme/domain | **Short text** or **dropdown** from curator's list (curator picks the mode). |
| 10 | Gate | Hackathon window (rounds, evaluation, submissions) opens **only after the PS is locked**. Enforced server-side. |
| 11 | Judges | Added by curator; log in as normal users; get the event-scoped `JUDGE` role. |
| 12 | Criteria | Set by curator (per round). Judge enters marks + review notes and submits. |
| 13 | Queue | **Team picks a judge** (judges tagged with its domain + judges marked available). Per-judge queue; judge taps **Call next**. |
| 14 | Multi-judge | Curator picks per round: **SINGLE**, **PANEL** (judges sit together, one slot, each marks) or **MULTI** (team collects N separate evaluations). |
| 15 | Slot timer | Curator sets slot length per round. Judge can mark **anytime during the slot**; at slot end the marks are due and **Call next is blocked until submitted**. |
| 16 | Marks privacy | Marks never shown to participants. |
| 17 | Edit lock | Judge can edit marks **within 5 minutes of first submit**, then locked (server-enforced). |
| 18 | Rounds | Curator adds rounds and decides elimination on/off and round type. |
| 19 | Scoring | Curator picks **cumulative** (marks add up across rounds) or **separate** (final = last round). |
| 20 | Winners | Curator declares winners **with notes**, irrespective of marks. |
| 21 | Notifications | **Push + in-app** notification / alert for all hackathon updates. |
| 22 | Extras in v1 | Curator **announcements**, **project submission links**, **mentors**, **team name** (from a registration form field if linked → else team lead sets → else default). |
| 23 | Judge accounts | Curator adds a judge by **mobile number or email** → find existing account or create a placeholder that links when they sign in with it. |
| 24 | Check-in | **Not required** to request evaluation (works for online/hybrid too). |
| 25 | Sub-events | Teams are imported only from the **hackathon event's own** group registrations, never the parent festival's. |
| 26 | PS changed after judging | Marks are **kept and flagged** ("PS changed after evaluation") on the curator's results. |
| 27 | Seat replacement | A member who leaves loses access; the lead re-invites through the **existing group seat flow**; the new member gets access on claiming. |
| 28 | Export & certificates | **Results CSV export**, **winner certificates**, **participant certificates** (via the existing certificates module). |
| 29 | Judge's view of a team | Team ID, team name, **member names**, PS/theme, project links. **No phone numbers or emails.** |
| 30 | Space web | The Space web leaderboard page is **retired** (removed). |
| 31 | Other board types | **Hackathon only.** Boards that aren't hackathons are no longer created or managed; any existing ones stay visible read-only in the participant "Competition" screen. |
| 32 | Co-Curator | Can do **everything except** declaring/publishing winners and issuing certificates (Curator / Space Admin only). |
| 33 | Opening the next round | **Blocked** while any non-cancelled team in a previous elimination round is still undecided; curator sees the undecided list. |
| 34 | Round end time | At `endAt` **new queue requests stop**; teams already waiting are still evaluated; curator closes the round. |
| 35 | Online / hybrid | Judge or panel location can be a room **or a meeting link**; a called team gets a **Join call** button. |
| 36 | Turning mode off | **Hides** hackathon screens, **keeps all data**; turning it on restores everything. Not allowed while a round is ACTIVE. |
| 37 | Delivery | **One PR per phase** to `main` (backend + mobile together), each tested before the next starts. |

---

## 3. Detailed rules (confirmed)

1. **Plan gate stays.** Hackathon mode needs the space's plan to include `hasLeaderboard`
   (existing gate). If not, the toggle shows "Not in your plan".
2. **Re-import is idempotent.** "Import teams" can be re-run; already-imported
   registrations are skipped, new ones get the next numbers. Optional ticket-type filter.
3. **Restored registration** (curator un-cancels) → the same team comes back active with
   the same ID.
4. **Members must claim their group seat** to see the hackathon (that's how the app knows
   who they are). Team detail shows unclaimed seats as "Not joined yet" so the lead can
   chase them.
5. **Theme in text mode** can't be matched to judges, so the judge picker shows all
   available judges.
6. **PS deadline (optional).** After it, teams can't submit/pick and the curator assigns.
7. **One open queue entry per team at a time.** In MULTI rounds the team requests the
   next judge after the previous evaluation completes, and can't pick the same judge twice
   in a round.
8. **No-show:** after the call grace (curator sets it per round, default 3 min) the judge
   may mark **No-show**; the request closes and the team may re-request from the back of
   the queue.
9. **PANEL slot completes when every panel judge has submitted.** The curator can
   force-complete if a judge is missing.
10. **Curator can reopen a locked judgment** for another 5 minutes (audited
    `reopenedBy/At`) — an escape hatch for typos. The curator never edits marks directly.
11. **Only submitted evaluations count** toward scores (drafts are ignored).
12. **Cumulative = plain sum** of each counted round's team score (the curator controls
    weight via max marks). Rounds have a `countsTowardTotal` flag (default on).
13. **Eliminated teams** keep read-only access to the hub (announcements, results,
    feedback, winners) but can't request evaluation or submit for later rounds.
14. **Judges' written notes** stay hidden from teams unless the curator turns on
    "Reveal feedback" (existing `revealReviews`); then a team sees notes about its own
    team only, without the judge's name. Marks stay hidden regardless.
15. **Winners published** → "You won *award*!" to the winning team **and** "Winners
    announced" to every other participant + judge.
16. **Push category** = existing `registrationUpdates`. The in-app copy is always written,
    even if push is off.
17. **Mentors** work like judges in **MENTORING rounds** only: same queue and slot,
    review notes only, no marks, no elimination.

---

## 4. Who sees what

| Audience | Team ID / room / venue | PS & theme | Queue | Marks | Judge notes | Standing (adv/elim) | Winners + notes |
|---|---|---|---|---|---|---|---|
| Team member (own team) | Yes | Own | Own position + called judge | **Never** | Only if curator reveals | Own + bracket | Yes (after publish) |
| Team member (other teams) | Team ID + name only | No | No | Never | Never | Bracket only | Yes |
| Judge / mentor | Teams in their queue/scope + **member names (no contacts)** | Yes (to evaluate) | Their own queue | **Own only**, edit ≤5 min | Own only | Yes | Yes |
| Curator / Co-Curator / Space Admin | All | All | All queues (live) | All | All | All (decides) | All (declares) |

Server-side guarantee (already built): participant read models never touch
`leaderboard_scores`, so marks cannot leak through the team path.

---

## 5. Team lifecycle

```
            import (group reg)          PS locked
 (none) ───────────────────▶ NEEDS_PS ───────────▶ ACTIVE ──(eliminated)──▶ ELIMINATED
                               │                     │
                               └──── registration cancelled / refunded ────▶ CANCELLED
                                                     (ID kept, shown "Cancelled")
```

`stage` is **derived** by the server on every read (registration status + `statementLockedAt`
+ latest elimination), plus a `cancelledAt` stamp written by the cancel hook so it's cheap
to filter. Hub content by stage:

- **NEEDS_PS**: team ID, name, members, venue, room, announcements, PS/theme screen.
- **ACTIVE**: + rounds, request evaluation / queue status, project links, results.
- **ELIMINATED**: read-only hub + results/feedback/winners.
- **CANCELLED**: banner "This registration was cancelled", team ID, nothing actionable.

---

## 6. Data model changes (`backend/prisma/schema.prisma`, LEADERBOARD block)

Follows the existing convention: soft UUID refs across aggregates, real FKs inside the
leaderboard aggregate, cascade within it. One additive migration per phase.

### 6.1 `Leaderboard` — hackathon config (new columns)
```
isHackathon          Boolean  @default(false)
teamCodePrefix       String?  VarChar(20)        // "HACK25-"
teamCodeDigits       Int      @default(3)
teamCodeNext         Int      @default(1)        // atomic counter; never decremented
teamNameFieldId      String?  Uuid               // soft ref → EventFormField (perGroup)
psMode               HackathonPsMode?            // TEAM_WRITES | TEAM_PICKS | CURATOR_ASSIGNS
themeMode            HackathonThemeMode @default(LIST)   // LIST | TEXT
psDeadline           DateTime?
scoringMode          HackathonScoringMode @default(PER_ROUND) // PER_ROUND | CUMULATIVE
venueName / venueAddress / venueLat / venueLng / venueMapUrl / venueNotes  // null = use event venue
```

### 6.2 `LeaderboardEntrant` — the team (new columns)
```
teamCode            String?  VarChar(40)   @@unique([leaderboardId, teamCode])
teamNameSource      FORM | LEAD | CURATOR | DEFAULT
cancelledAt         DateTime?
roomId              String?  Uuid (FK → hackathon_rooms, SetNull)
statementId         String?  Uuid (FK → hackathon_statements, SetNull)
customStatementTitle String? VarChar(200)
customStatementText  String? Text
themeId             String?  Uuid (FK → hackathon_themes, SetNull)
themeText           String?  VarChar(60)
statementLockedAt   DateTime?
statementSetBy      String?  Uuid           // team member or curator
statementChangedAfterEvalAt DateTime?       // set when the curator changes PS/theme after
                                            // any submitted evaluation → results flag
```
Import writes `registrationId` (already exists). Members = lead + CLAIMED seats — reuse
`teamUserIds()`. Membership is resolved **live** from group seats, so a member who leaves
loses access immediately and a replacement invited through the existing seat flow gains
access the moment they claim — no hackathon-side roster to sync.

### 6.3 `LeaderboardRound` — round config (new columns)
```
kind                 HackathonRoundKind @default(EVALUATION)   // EVALUATION | MENTORING
judgingMode          HackathonJudgingMode @default(SINGLE)     // SINGLE | PANEL | MULTI
requiredEvaluations  Int @default(1)        // MULTI: N (≥2)
slotMinutes          Int @default(10)
callGraceMinutes     Int @default(3)
eliminationEnabled   Boolean @default(true)
countsTowardTotal    Boolean @default(true) // used when scoringMode = CUMULATIVE
submissionsCloseAt   DateTime?              // project links editable until then (else until CLOSED)
```

### 6.4 New tables
```
hackathon_rooms        id, leaderboardId FK, name, location?, capacity Int (teams), notes?, order
hackathon_themes       id, leaderboardId FK, name, order                    @@unique(leaderboardId, name)
hackathon_statements   id, leaderboardId FK, code VarChar(20), title, description Text,
                       themeId? FK, maxTeams Int?, order                    @@unique(leaderboardId, code)
hackathon_judge_profiles  id, leaderboardId FK, userId (soft), themeIds Uuid[], location?,
                       meetingUrl?, isAvailable Boolean @default(true)     @@unique(leaderboardId, userId)
hackathon_panels       id, leaderboardId FK, roundId? FK, name, location?, meetingUrl?
hackathon_panel_members  panelId FK, userId (soft)                         @@id(panelId, userId)
hackathon_eval_requests  id, leaderboardId FK, roundId FK, entrantId FK,
                       judgeUserId? (soft) | panelId? FK,
                       status HackathonEvalStatus,  // WAITING CALLED IN_PROGRESS AWAITING_MARKS
                                                    // COMPLETED NO_SHOW WITHDRAWN CANCELLED
                       requestedBy, requestedAt, calledAt?, startedAt?, slotEndsAt?, closedAt?
                       partial unique: one open request per (entrantId) where status in open set
                       index (judgeUserId, status, requestedAt), (panelId, status, requestedAt)
hackathon_submissions  id, entrantId FK, roundId FK, links Json [{label,url}], notes?,
                       submittedBy, updatedAt                              @@unique(entrantId, roundId)
hackathon_announcements id, leaderboardId FK, audience (ALL|TEAMS|JUDGES|ROOM), roomId?,
                       title, body, createdBy, createdAt
```

### 6.5 Changes to existing tables
- `leaderboard_judgments`: add `requestId?` (FK → eval request), `reopenedBy?`,
  `reopenedAt?`. **Semantics change:** `submittedAt` is stamped on **first** submit
  only and never reset; `editableUntil = max(submittedAt, reopenedAt) + 5 min`.
- `leaderboard_awards`: add `notes Text?` (shown with the winner). The existing
  `@@unique([leaderboardId, title])` stays, so two awards need distinct titles
  ("Special mention — Design", "Special mention — Impact").

### 6.6 Generic in-app notification feed (outside the leaderboard block)
```
user_notifications  id, userId (soft), eventId?, type VarChar(40), title, body,
                    deepLink?, data Json?, readAt?, createdAt
                    index (userId, createdAt desc), (userId, readAt)
```
Generic by design (other features can use it later) but v1 only hackathon writes to it.

---

## 7. Evaluation queue (the core mechanic)

**Who a team can pick** (in an ACTIVE round the team is eligible for):
- SINGLE / MULTI: judges on the round's panel scope (existing `LeaderboardPanelist`)
  whose `themeIds` include the team's theme, plus any judge with `isAvailable` and no
  theme restriction. Each judge card shows the queue length, a rough wait (`queue ×
  slotMinutes`), location, and whether the judge is on a break.
- PANEL: the round's panels.
- MENTORING: mentors, same rules.

**State machine** (server timestamps are the source of truth):
```
WAITING ──judge "Call next"──▶ CALLED ──judge "Start"──▶ IN_PROGRESS ──slot ends──▶ AWAITING_MARKS
   │                             │                          │                          │
   │ team withdraws              │ grace passed,            │ marks submitted early     │ marks submitted
   ▼                             ▼ judge "No-show"          ▼                          ▼
WITHDRAWN                     NO_SHOW                    COMPLETED ◀──────────────── COMPLETED
(team cancelled / eliminated / round closed while open → CANCELLED)
```
Rules:
- Judge can **Call next** only when they own no CALLED / IN_PROGRESS / AWAITING_MARKS slot.
- On call: push + in-app "You're up — go to *Judge name* at *location*" (or "Join call"
  when the judge/panel has a `meetingUrl`) to the called team; "You're next" to the team
  now at position 1.
- `slotEndsAt = startedAt + slotMinutes`. `AWAITING_MARKS` is derived lazily on read and
  by a 30-second scheduler tick (which also sends the judge a "Time's up — submit marks"
  push).
- Submitting the judgment (§8) completes the request (PANEL: when all members submitted).
- A team may have **one open request** (DB partial unique index). SINGLE/PANEL: one
  COMPLETED per round. MULTI: up to `requiredEvaluations` COMPLETED with distinct judges.
- Round `endAt` passed → new requests rejected; WAITING/CALLED/IN_PROGRESS requests carry on.
- Round closed → all open requests CANCELLED, teams notified.
- Curator (live queue monitor): remove from queue, move a team to another judge,
  force-complete, pause a judge.

**Realtime:** extend `LeaderboardGateway` (socket.io, already a mobile dependency) with
rooms `judge:<userId>`, `panel:<id>`, `team:<entrantId>`, `board-manage:<eventId>`;
broadcast queue deltas. Mobile falls back to 10-second polling if the socket drops.

---

## 8. Marks, notes and the 5-minute lock

- Judge scoring screen = existing `JudgingEntrantScreen`, extended with: the slot timer,
  the team's PS/theme/project links, and the lock countdown.
- Draft saves allowed until first submit. Submit requires every criterion of the round
  filled and in range.
- After first submit: edits allowed until `editableUntil`; server returns
  `403 JUDGMENT_LOCKED` afterwards. The judge can still **view** their own submitted
  marks read-only while the round is open (the existing round-close read-lock stays).
- Mentors: review notes only; any numeric score is rejected (existing rule).

## 9. Scoring & results

- Evaluation score = existing weighted-criteria total (`ranking.ts`), **submitted
  judgments only**.
- Round score = average over that team's COMPLETED evaluations in the round (SINGLE: 1
  judge; PANEL: panel members; MULTI: N judges).
- `PER_ROUND`: final ranking = last EVALUATION round (existing behaviour).
  `CUMULATIVE`: total = Σ round scores where `countsTowardTotal`.
- **Opening a round** (`setRoundStatus → ACTIVE`) is rejected while any non-cancelled
  team in an earlier round with `eliminationEnabled` is still PENDING; the error lists
  those teams. Eligible teams for a round = teams ADVANCED in the latest earlier
  elimination round (or all non-cancelled teams if there is none).
- Rankings are a **guide for the curator only**. Advance/eliminate stays manual (existing
  `setEntrantRoundStatus`), with a "Select top N" helper in the mobile UI.
  Rounds with `eliminationEnabled = false` hide advance/eliminate; every non-cancelled
  team is eligible for the next round.
- Winners: existing awards + `notes`. Curator can pick any team regardless of rank.
- **PS changed after evaluation**: marks are kept; the team's row on the curator's
  results shows a "PS changed after evaluation" flag (`statementChangedAfterEvalAt`).

### 9.1 Results CSV export
Curator downloads one CSV from the results screen: Team ID, team name, status
(active / eliminated / cancelled), room, PS code/title, theme, then per round: each
judge's marks per criterion, evaluation totals, round score, rank, advance/eliminate;
then cumulative total (if on), awards. Served by the backend
(`GET …/hackathon/results.csv`); mobile opens it through the system share sheet.

### 9.2 Certificates (existing certificates module)
- The module already issues one certificate per **claimed group seat** for a registration
  (`CertificateAudience.MANUAL` + registration IDs), so hackathon issuing is a thin wrapper:
  - **Participants**: every non-cancelled team's registration.
  - **Winners**: registrations of teams holding a published award, one batch per award.
- New template text keys: `teamName`, `teamCode`, `awardTitle` (renderer resolves them from
  the recipient's hackathon team; blank for non-hackathon events).
- The curator picks an **existing certificate template** in mobile. Designing templates
  stays where it is today (Space web certificates page), which is not part of the retirement.
- Existing plan gate for certificates still applies.

---

## 10. Notifications (push + in-app)

`NotificationsService.send()` gains an `inbox` option that writes one `user_notifications`
row per recipient (regardless of push opt-out) alongside the OneSignal push. New
`NotificationEvents.HackathonUpdate` with a `kind` discriminator; copy lives next to
`competitionPushCopy()`.

| Trigger | To | Deep link |
|---|---|---|
| Team imported + ID assigned | Team | `hackathon/:eventId` |
| Room allocated / changed | Team | hub |
| PS assigned / changed by curator | Team | hub → PS |
| PS deadline in 1 hour (if set, PS not locked) | Team | PS screen |
| Round opened / closed | Eligible teams + round judges | hub / judge console |
| You're next / You're up / No-show | Team | queue screen |
| Team joined your queue (only when you're idle) | Judge | judge console |
| Time's up — submit marks | Judge | scoring screen |
| Advanced / eliminated (existing) | Team | results |
| Feedback revealed (existing) | Team | results |
| Winners published | Winners + everyone | results |
| Curator announcement | Chosen audience | updates |

**In-app side (mobile):**
- Bell with unread badge on the Hackathon hub and judge console → **Updates** feed
  (`GET /me/notifications?eventId=`, mark-read endpoints).
- `OneSignalService.addNotificationForegroundListener` (exists, unused) → show an
  in-app banner for hackathon types and refresh the relevant screen. "You're up" shows a
  **modal alert** instead of a banner so it can't be missed.

---

## 11. Backend API (all in `backend/src/leaderboard/`, new files beside the service)

Split the 1,600-line service: `hackathon-teams.service.ts`, `hackathon-queue.service.ts`,
`hackathon-setup.service.ts`, plus `hackathon.controller.ts`. Manager routes are gated
by `event:manage-leaderboard` (Curator, Co-Curator, Space Admin); **awards (create /
publish / notes) and certificate issuing** are gated by a new capability
`event:declare-hackathon-winners`, seeded for **CURATOR only** (Space Admin inherits;
Co-Curator does not), editable in the IAM console. Team routes are gated by team
membership + stage; judge routes by panel assignment.

Turning hackathon mode off sets the board `enabled = false` (all data kept); rejected
while any round is ACTIVE. Every team/judge endpoint returns 404 while disabled.

**Curator** (`/events/:eventId/hackathon/...`)
- `POST enable` / `PATCH config` — mode on, prefix/digits, PS mode, theme mode, deadline,
  scoring mode, venue, team-name field.
- `POST teams/import` `{ ticketTypeIds? }` → `{ imported, skipped, rejectedIndividual }`
  (this event's own GROUP registrations only; never a parent festival's)
- `GET teams` · `PATCH teams/:id` (code, name, room, PS/theme assign)
- `CRUD rooms` · `POST rooms/auto-allocate`
- `CRUD themes` · `CRUD statements`
- `GET/POST/PATCH/DELETE judges` (by mobile number or email → find-or-create, kind,
  themes, location) — wraps existing `assignPanelist`; adds a find-or-create-by-mobile
  helper beside the existing by-email one
- `CRUD panels` (+ members)
- Rounds: existing routes + new config fields on `CreateRoundDto`/`UpdateRoundDto`
- `GET queues` (live monitor) · `POST queue/:requestId/{remove|reassign|force-complete}`
- `POST judgments/:id/reopen`
- `GET results` (per-round + cumulative, all marks, PS-changed flags) · `GET results.csv`
- `POST certificates/issue` `{ templateId, audience: PARTICIPANTS | WINNERS }` → existing
  batch flow
- Awards: existing + `notes`
- `POST announcements` · `GET announcements`

**Team** (`/hackathon/:eventId/...`)
- `GET me` → hub payload (stage, team, members, venue, room, PS/theme, rounds + my
  eligibility, open request, unread count). **No marks.**
- `PATCH me/team-name` (lead only, allowed anytime; curator can override)
- `GET statements` · `POST me/statement` (write own / pick; locks)
- `GET rounds/:roundId/evaluators` (pickable judges/panels + queue length)
- `POST rounds/:roundId/requests` `{ judgeUserId | panelId }` · `DELETE requests/:id`
- `PUT rounds/:roundId/submission` (links)
- `GET results` (existing participant view + winner notes)

**Judge** (existing `my-judging-events`, `my-assignments`, judgment routes, plus)
- `GET /events/:eventId/hackathon/judge/console` (my queue, current slot, availability)
- `PATCH .../judge/availability` · `POST .../judge/call-next` · `POST requests/:id/start`
  · `POST requests/:id/no-show`
- Team payloads to judges carry member **names only** (no phone numbers or emails).

**Me**: `GET /me/notifications` · `POST /me/notifications/read` `{ ids | all, eventId? }`

---

## 12. Mobile screens (Expo Router, thin route files → `src/screens/`)

**Curator** — new row **"Hackathon"** in `ManageEventScreen` (Run this event group,
visible with `event:manage-leaderboard`) → `app/manage/event/[eventId]/hackathon/`
| Route | Screen |
|---|---|
| `index.tsx` | Dashboard: mode toggle, counts (teams / PS locked / in queue / evaluated), shortcuts |
| `settings.tsx` | Team ID pattern (live preview), PS mode, theme mode, deadline, scoring mode, team-name field, venue |
| `teams.tsx` · `team/[entrantId].tsx` | Import button, list with ID / name / stage / room, cancelled chips, edit ID/name/room/PS |
| `rooms.tsx` | Rooms CRUD + auto-allocate |
| `statements.tsx` · `themes.tsx` | PS list (code, title, theme, max teams, taken count), themes list |
| `judges.tsx` · `panels.tsx` | Add judge/mentor by phone/email, themes, location or meeting link, round scope; panels |
| `rounds.tsx` · `round/[roundId].tsx` | Rounds list; round config, criteria, open/close, advance/eliminate with "top N" helper |
| `queues.tsx` | Live queue monitor across judges |
| `results.tsx` | Marks matrix + ranking (per round / cumulative), PS-changed flags, reopen judgment, **Export CSV** |
| `winners.tsx` | Awards + notes, publish |
| `certificates.tsx` | Pick template → issue to participants / winners, batch progress |
| `announce.tsx` | Compose announcement (audience picker), history |

**Team** — `app/hackathon/[eventId]/` (deep link `unifesto://hackathon/:eventId`)
| Route | Screen |
|---|---|
| `index.tsx` | Hub: team ID card, stage banner, venue (map link), room, members, updates bell, round cards |
| `statement.tsx` | Write own / pick from list / "waiting for curator"; theme dropdown or text |
| `evaluate.tsx` | Pick judge/panel → queue position, live status, "You're up" + slot timer |
| `submission.tsx` | Project links per round |
| `team.tsx` | Members (claimed / not joined yet), team name edit (lead) |
| `updates.tsx` | In-app notification feed |
| `results.tsx` | Reuse `CompetitionScreen` (bracket, winners + notes, revealed feedback) |

Entry points: ticket screen row "Hackathon" (replaces the "Competition" row when
`isHackathon`), event detail page for registered users, push deep links.
`app/competition/[eventId]` stays for non-hackathon boards.

**Judge** — extend existing `app/judging/`
- `judging/[eventId]/index.tsx` → **Judge console**: availability toggle, current slot
  (team ID, name, PS, room, timer, Start / No-show), waiting list, **Call next**
  (disabled until marks submitted), completed list with lock countdowns.
- `judging/[eventId]/[entrantId].tsx` → add timer, PS + project links, 5-minute lock
  state, "Locked" read-only view.

Shared: `src/lib/api/hackathon.ts` (client), `src/lib/hackathon.ts` (pure helpers: stage
copy, team code preview, timer maths — unit-testable), `src/hooks/useHackathonSocket.ts`,
`src/components/hackathon/*` (TeamIdCard, SlotTimer, QueueCard, StageBanner).
Follow `mobile/DESIGN.md` tokens and existing `SettingsGroup`/`SettingsRow` patterns.

---

## 13. Build phases

**One PR per phase** to `main`. Each phase ships backend + mobile together, stays
`tsc`-clean in backend and mobile, and is tested before the next phase starts.
Until Phase 6 removes it, the Space web leaderboard page must keep compiling (existing
endpoints stay backward compatible).

1. **Foundation: mode, teams, IDs, venue, rooms, inbox** — **DONE 2026-09-30 (not deployed)**
   Migration (6.1, 6.2 team-code/room/cancel columns, rooms, `user_notifications`);
   enable + config; import with ID counter (transaction, `SELECT … FOR UPDATE` on the
   board row); cancellation hook in the registration cancel/refund paths + read-time
   fallback; team-name resolution; auto-allocate; notification `inbox` option + feed
   endpoints. Mobile: curator dashboard/settings/teams/rooms; team hub (NEEDS_PS view),
   team screen, updates feed, foreground banner.
   *As built:* cancellation is detected by comparing each team with its registration
   on every read that shows teams (`syncCancellations`), instead of hooking the six
   places that cancel registrations, so new cancel paths are covered too. The in-app
   feed lives at `users/me/notifications` (next to `users/me/push-devices`). Hackathon
   and competition pushes also land in the feed, and while the app is open they show
   as an in-app card instead of the system banner. `competition` and `hackathon` were
   added to the deep-link allowlist (competition push taps weren't routing before).
   Hackathon GETs are never served from the app's memory cache. New boards start
   with a PENDING "Round 1" so nothing is judged until the curator opens a round.
2. **Problem statements & themes** — **DONE 2026-09-30 (not deployed)**
   Themes, statements (max-teams enforced transactionally), three PS modes, deadline,
   lock + curator override, hub gate. Mobile: curator statements/themes, team statement
   screen, ACTIVE hub.
   *As built:* only the **team lead** locks in the statement (other members see the same
   choices read-only), in one go; a `statementLockedAt: null` guard on the write makes a
   double tap or two devices land exactly one lock. A limited statement's row is locked
   `FOR UPDATE` while its teams are counted, so two teams can't take the last place; the
   limit binds the curator too ("raise its limit first"). The curator sets a team's
   statement with `PUT …/teams/:id/statement` (any mode, after the deadline, locks it) and
   can **reopen** it with `POST …/teams/:id/statement/unlock`, which clears the statement
   and theme (freeing its place) so the team chooses again; the plan's `PATCH teams/:id`
   stays for ID/name/room only. Team routes: `GET hackathon/:eventId/statements` and
   `POST hackathon/:eventId/me/statement`. A theme is required unless the statement has
   its own, or the board is in LIST mode with no themes yet. Deleting a statement or theme
   an active team has is refused (FKs are `NO ACTION`); cancelled teams just drop it.
   Hub gate on the server: `submitJudgment` rejects teams that are cancelled or have no
   locked statement, and the judge's assignment list leaves them out (and returns nothing
   while hackathon mode is off). New push + in-app kinds: statements open (sent when the
   curator's settings open the window), locked (to teammates), assigned/changed,
   reopened, and a deadline reminder an hour before (5-minute cron, claimed through
   `psDeadlineRemindedFor` so it's sent once per deadline and re-armed when it moves).
   Statement notices deep-link to the statement screen. Migration
   `20260930130000_hackathon_statements`.
3. **Judges, rounds config, queue, 5-minute lock** (largest)
   Judge profiles/themes/availability, panels, round config columns, eval requests +
   state machine + scheduler + socket rooms, judgment semantic change + reopen.
   Mobile: curator judges/panels/rounds/queues, team evaluate screen, judge console,
   scoring screen changes.
4. **Scoring modes, advancement, winners, export**
   Submitted-only aggregation, CUMULATIVE mode, "top N" helper, award notes, winners
   broadcast, PS-changed flag, results CSV. Mobile: curator results + winners, team
   results.
5. **Announcements, project links, mentors, polish**
   Announcements, submissions, MENTORING rounds. Remaining notification triggers from
   §10. Mobile: announce screen, submission screen, mentor path in console. End-to-end
   run-through on a device.
6. **Certificates + retire Space web leaderboard**
   Certificates wrapper + new template keys; mobile certificates screen. Then remove
   `websites/space/app/(dashboard)/dashboard/events/[eventId]/leaderboard/` (page + 7
   tabs), its nav item in `websites/space/components/shell/EventNav.tsx`,
   `websites/space/lib/api/leaderboard-api.ts` and `websites/space/lib/hack.ts`; remove
   the backend's legacy `/leaderboard/judges` routes (kept only for the old `hack` app;
   nothing calls them). `tsc` the Space app after removal.

## 14. Testing

- Unit (`ranking.spec.ts`, new `hackathon-*.spec.ts`): team-code formatting + never-reuse
  across cancellation; import rejects individual registrations and is idempotent;
  stage derivation; PS max-teams race; queue transitions (call-next blocked,
  one-open-request, MULTI distinct judges, PANEL completion); 5-minute lock + reopen;
  cumulative vs per-round totals; participant payloads contain no marks (snapshot test
  on `GET hackathon/:eventId/me` and results).
- Mobile: pure helpers in `src/lib/hackathon.ts`; `tsc`; bundle check.
- Manual device run: curator + 2 team members + 2 judges on real accounts through one
  full round.

## 15. Deploy checklist

- `prisma migrate deploy` (one migration per phase).
- Backend rebuild (new scheduler tick; socket rooms).
- Mobile **native build** isn't needed (no new native modules); JS update is enough
  unless the bundle's runtime fingerprint changes.
- Confirm `JUDGE` / `MENTOR` role rows exist and `hasLeaderboard` is on for the target
  plan.
- Phase 6: rebuild + deploy the Space web app after the leaderboard page is removed.

## 16. Out of scope (v1)

- Any new website feature (Space, Apex, public web), including a public bracket page.
  The only website work is the Phase 6 removal.
- Apex leftovers (`websites/apex/lib/hack.ts`, `websites/apex/lib/api/leaderboard-api.ts`)
  are left untouched; the Apex plans page keeps its `hasLeaderboard` toggle.
- Check-in gating for evaluation (not required, by decision).
- Importing teams from a parent festival's registrations.
- A certificate template designer in mobile.
- Managing boards that aren't hackathons (quiz / coding-contest points boards).
- Blind judging, self-service team formation / team switching, individual participants.
- Judges seeing other judges' marks; participants seeing any marks.
- Automatic advancement by score (advancement stays manual).
