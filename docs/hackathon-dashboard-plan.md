# Hackathon Dashboards — Plan

Status: **HISTORICAL RECORD** — Phases 1, 3 and 4 are built. Date: 2026-09-19.

> **Superseded for all new work by [`hackathon-mobile-plan.md`](hackathon-mobile-plan.md)
> (2026-09-30).** This file now only records what the `leaderboard` module already
> does. Items that conflicted with the new plan (Space web curator UI, public web
> bracket, `hack` app removal, independent-only scoring, edit-until-close) have been
> removed. Where anything here still disagrees with the new plan, the new plan wins.

The backend `leaderboard` module was extended with **rounds, reviews, mentors,
per-round panels, manual advancement/elimination, named awards, and a privacy
model**. Judges and mentors score in mobile; participants see their round status,
winners and (when revealed) written feedback. **Participants never see marks.**

---

## Locked decisions

Decided in the planning discussion (2026-09-19). Do not re-open without cause.

1. **Mobile + backend only.** Judge/mentor scoring, the participant view and (per the
   new plan) curator management all live in the mobile app. Websites are not extended.
2. **Two new event-scoped roles: `JUDGE` (marks + reviews) and `MENTOR` (reviews only,
   no marks).** `JUDGE` already exists in `RoleCode`; `MENTOR` is added. Mentors are
   identical to judges in every rule (per-round panels, edit-until-close then lock,
   curator-gated reveal) **except they submit no numeric scores**.
3. **Judges/mentors invited by email → find-or-create account** (same pattern as
   manual attendee add, `[[manual-bulk-attendee-add]]`). No event registration required.
   Mobile shows a **"Judging" section** only when the signed-in user holds a
   JUDGE/MENTOR assignment.
4. **Rounds: optional, multi-round.** A board with zero rounds behaves as one implicit
   round. Curators add named rounds (Screening → Semis → Finals). Scoring across rounds
   (separate vs cumulative) is set by the curator — see the new plan §9.
5. **Advancement/elimination is MANUAL** — curator decides, ranking shown as a guide.
   `LeaderboardEntrantRound.status` is the source of truth for what attendees see.
6. **Reviews = per-criterion comments + one overall review** per `(panelist, entrant,
   round)`. A judgment record carries the overall text + `submittedAt` and is the
   single source of truth for "has this judge/mentor reviewed them?".
7. **Panels: judges/mentors assigned per-round** (and optionally per-entrant); unset =
   covers all rounds/entrants. Panel assignment is leaderboard-internal, **separate
   from** the event-scoped `UserRole` (which grants app access, not round scope).
8. **Both board modes kept: `RUBRIC` and `METRIC`.** Rounds / advancement / winners /
   participant-visibility are **mode-agnostic**. Panels / scores / reviews / mentors are
   **RUBRIC-only** (METRIC boards have no judges — organiser types raw values, ranked by
   the primary metric per round).
9. **Aggregation = weighted-criteria total averaged across the judges who actually
   scored** an entrant (matches existing RUBRIC logic; fair when panels split by entrant).
10. **Judging is named** (not blind). Judges see entrant names + roster/project meta.
11. **Winners = named awards** (`LeaderboardAward`: Winner, Runner-up, Best Design,
    People's Choice…), declared by Curator/Space Admin only, with their own publish flag.
12. **New capability `event:manage-leaderboard`** gates board/round/panel/winner
    management. Panelists are authorized by their assignment, not this cap.
13. **Notifications in v1** — push on advance/eliminate and on feedback reveal, via the
    existing OneSignal path (`[[notifications-and-dashboards]]`).
14. **Migration is greenfield / additive** — per decision, no live board data to
    preserve, so no backfill.

### Privacy rules (the core requirement)

| Audience | Marks | Written reviews | Round status (advance/eliminate) | Winners |
|---|---|---|---|---|
| **Participant** (own team) | **Never** | Only when curator **reveals** | Always | Always |
| **Participant** (other teams) | Never | Never | Bracket only | Always |
| **Judge / Mentor** | Own cells only; editable for **5 minutes after first submit** (new plan §8); **fully read-locked after round CLOSED** | Own reviews, same locking | Yes | Yes |
| **Curator / Co-Curator / Space Admin** | All | All | All | All (declares them) |

- Judges/mentors **never** see other panelists' marks or reviews, at any time. This
  kills the "show me the other team's marks" pressure.
- The **round-close read-lock is enforced server-side**, not just hidden in the UI: the
  score/review read endpoints gate on `round.status === CLOSED` for panelist callers.
- The participant-facing bracket reads **only** from `LeaderboardEntrantRound.status`
  and `LeaderboardAward` — it never touches the score tables, so a mark cannot leak
  through the participant path.

---

## Key facts established during discovery

- **Backend `leaderboard` module exists** (`backend/src/leaderboard/`): controller,
  service (436 lines), websocket `gateway`, `ranking.ts` (+ spec), DTOs. One
  `Leaderboard` per event; `RUBRIC` | `METRIC`; `DRAFT/LIVE/FROZEN/FINAL`;
  `PUBLIC | PARTICIPANTS_ONLY`.
- **Models today**: `Leaderboard`, `LeaderboardMetric` (criteria: weight, min/max,
  `isPrimary`), `LeaderboardEntrant` (soft links `registrationId`/`userId`, `meta`
  JSON, denormalised `totalScore`/`rank`), `LeaderboardScore` (one cell per
  `(entrant, metric, judgeUserId)`; METRIC cells have `judgeUserId = null` with a
  hand-written partial unique index).
- **No round model and no review/feedback field exist today** — rounds, per-criterion
  comments, overall reviews, review-completion tracking, panels, manual
  advancement/elimination, and named awards are **all new**.
- **`RoleCode.JUDGE` already exists** (schema line ~50) and the service already assigns
  it as an event-scoped `UserRole` (`assignJudge`/`removeJudge`/`listJudges`). Judges
  authorize via `isEventJudge`; managers via `isEventManager`/`assertManager`. Plan gate
  is `PlanConfigService.getEffectiveLimits(...).hasLeaderboard`.
- **Soft-reference convention**: cross-aggregate links are bare UUID columns (no Prisma
  FK); real FKs only *inside* the leaderboard aggregate. New models follow this.
- **Space web** has a full leaderboard management page (`websites/space/.../leaderboard/`,
  7 tabs). It is **not extended** further; backend changes keep its endpoints working.
- The old standalone `hack` app is no longer in this repo.
- **Authorization primitives**: `src/auth/authorization/actions.ts` (Action enum +
  `RoleScope`), `capabilities.ts`, `can.decorator.ts`/`can.guard.ts`, DB-backed editable
  matrix (`capability-config.service.ts`, see `[[iam-console]]`). New action added here.
- **Mobile** = Expo Router (`mobile/app/`): `(tabs)`, `event/`, `checkin/`, `ticket/`,
  `group/`, etc. Judge/mentor/participant screens are new route groups.

---

## Data model additions

All new models live in the `LEADERBOARD` block of `prisma/schema.prisma`, follow the
soft-reference convention, and cascade-delete within the aggregate.

### `LeaderboardRound`  *(mode-agnostic)*
```
id, leaderboardId (FK), name, order Int,
status: LeaderboardRoundStatus @default(PENDING)   // PENDING | ACTIVE | CLOSED
startAt?, endAt?,
createdAt, updatedAt
@@unique([leaderboardId, order])
```
- Enum `leaderboard_round_status`: `PENDING`, `ACTIVE`, `CLOSED`.
- A board with no rounds = one implicit round (service synthesises it so scoring code
  has a `roundId` to key on). Consider always materialising a "Round 1" row on board
  create to avoid a null-round special case.

### `LeaderboardEntrantRound`  *(mode-agnostic — drives the attendee bracket)*
```
id, entrantId (FK), roundId (FK),
status: LeaderboardEntrantRoundStatus @default(PENDING)  // PENDING | ADVANCED | ELIMINATED
roundScore Decimal?     // denormalised per-round aggregate for O(1) reads
rank Int?               // rank within this round
decidedBy?, decidedAt?  // curator who set ADVANCED/ELIMINATED
@@unique([entrantId, roundId])
```

### `LeaderboardPanelist`  *(RUBRIC — per-round assignment, separate from UserRole)*
```
id, leaderboardId (FK),
userId (soft ref),
kind: LeaderboardPanelistKind    // JUDGE | MENTOR
roundId? (FK)                    // null = all rounds
entrantId? (FK)                  // null = all entrants in scope
createdAt
@@unique([leaderboardId, userId, roundId, entrantId])
```
- The event-scoped `UserRole` (JUDGE/MENTOR) grants app access + shows the "Judging"
  section; `LeaderboardPanelist` scopes *which rounds/entrants* they act on.

### `LeaderboardJudgment`  *(RUBRIC — review + completion tracking)*
```
id, entrantId (FK), roundId (FK),
panelistUserId (soft ref),
kind: LeaderboardPanelistKind,       // JUDGE or MENTOR (mentors: review only)
overallReview? Text,
submittedAt?,                        // set on submit → "reviewed" = submittedAt != null
createdAt, updatedAt
@@unique([entrantId, roundId, panelistUserId])
```
- This record is the single source of truth for **"has this judge/mentor reviewed
  them?"** shown on the curator dashboard.

### Changes to existing models
- **`LeaderboardScore`** — add `roundId (FK)` and optional `comment Text` (per-criterion
  note). Rework the uniqueness to `(entrantId, metricId, judgeUserId, roundId)` and
  update the partial unique index for METRIC (`judge_user_id IS NULL`) to include
  `round_id`.
- **`LeaderboardMetric`** — add `roundId? (FK)` so criteria can differ per round
  (null = applies to all rounds / board-level). Keep `isPrimary` semantics per round
  for METRIC.
- **`Leaderboard`** — add `revealReviews Boolean @default(false)` (curator toggle that
  opens participant feedback) and keep existing `status`/`visibility`.

### `LeaderboardAward`  *(mode-agnostic — winners)*
```
id, leaderboardId (FK), entrantId (FK),
title VarChar,          // "Winner", "Best Design", …
order Int,
published Boolean @default(false),
declaredBy?, declaredAt?,
@@unique([leaderboardId, title])
```

---

## Authorization

- Add `EVENT_MANAGE_LEADERBOARD = 'event:manage-leaderboard'` to
  `actions.ts` with `RoleScope.EVENT`; seed it in the capability matrix for
  SPACE_ADMIN / CURATOR / CO_CURATOR (not CREW), editable in the IAM console
  (`[[iam-console]]`).
- Add `MENTOR` to `RoleCode` (migration; enum-add is transaction-safe on PG12+, and the
  value isn't used in the same migration — same note as the original JUDGE add).
- Service authorization:
  - Board/round/panel/entrant/award management → `assertCan(EVENT_MANAGE_LEADERBOARD)`.
  - Score/review writes → caller must be a `LeaderboardPanelist` whose scope covers the
    `(round, entrant)`; JUDGE may write scores + comments + review; MENTOR may write
    review + comments only (reject any numeric score).
  - Score/review **reads** by a panelist → gate on `round.status !== CLOSED` and
    `panelistUserId === caller`; never return other panelists' cells.
  - Participant reads → only `EntrantRound.status`, awards where `published`, and — for
    their own entrant — reviews only where `leaderboard.revealReviews`.

---

## Scoring & aggregation

- Per round, per entrant: for each judge who submitted, compute the weighted-criteria
  total (existing `ranking.ts` logic, scoped to that round's metrics), then **average
  across judges who scored that entrant**. Write to `EntrantRound.roundScore` + `rank`.
- `Leaderboard.status`/gateway retained; recompute + broadcast on score write and on
  status/award change. Participant channel receives only status/award deltas.
- METRIC mode: no judges; organiser-entered value per metric per round; rank by the
  round's `isPrimary` metric. Tie-break via existing `tieBreak`/`tieBreakMetricId`.

---

## Phased implementation

Each phase is independently shippable and leaves the tree tsc-clean.

### Phase 1 — Backend: schema, migration, service, authorization
- Add models/enums above; migration (additive, + `MENTOR` enum value, +
  `event:manage-leaderboard` action + matrix seed).
- Extend service: rounds CRUD + status transitions; panel assignment; judgment
  (review) upsert + submit; per-criterion comments; manual advance/eliminate; awards
  CRUD + publish; `revealReviews` toggle; round-close read-lock; mentor write rules.
- Extend/again-gate controller routes; keep the plan gate (`hasLeaderboard`).
- Unit tests: aggregation with split panels, round-close lock, mentor-no-score,
  participant read filtering.

### Phase 2 — Curator UI
Moved to **mobile** — see the new plan §12 (not the Space web page).

### Phase 3 — Mobile: judge / mentor scoring — **DONE 2026-09-20 (tsc-clean, tests pass, NOT deployed)**
New route group `mobile/app/judging/`: "Judging" entry appears when the user holds
a JUDGE/MENTOR assignment. Per assigned round → list of assigned entrants with
reviewed/not-reviewed state; scoring screen (criteria sliders/inputs + per-criterion
comment + overall review; **mentors: review only**); submit sets `submittedAt`;
edit-until-close, then the screen goes read-locked. Never render other panelists' data.

**Delivered:**
- **Backend (one additive read endpoint):** `GET /leaderboard/my-judging-events` +
  `LeaderboardService.getMyJudgingEvents(userId)` — cross-event discovery (the panelist
  analogue of `getMyCheckinEvents`), returns each board the user is on with card fields,
  their `kind` (JUDGE wins over MENTOR), and `activeRounds`/`totalRounds`. Filters to
  `enabled` boards + non-deleted events; does NOT filter on event end (judging runs
  during/after). No change to scoring/privacy logic — the round-close read-lock and
  own-cells-only reads are already enforced in Phase 1.
- **Mobile API client** `mobile/src/lib/api/leaderboard.ts`: `getMyJudgingEvents`,
  `getMyAssignments(eventId)`, `getMyJudgment(entrantId, roundId)` (403 → `locked`, not
  an error), `submitJudgment(entrantId, {roundId, scores?, overallReview?, submit?})`.
- **Screens** (`src/screens/`, thin route files in `app/judging/`): `JudgingListScreen`
  (global "My Panels" list, mirrors CheckinListScreen), `JudgingEventScreen` (rounds +
  in-scope entrants with reviewed state; PENDING rows shown-but-disabled, CLOSED rounds
  render locked note w/ no entrants), `JudgingEntrantScreen` (criteria numeric inputs +
  per-criterion comment + overall review; mentors → review only; Save-draft vs
  Submit; 403 → "Round closed" read-only). Entry point added to ProfileScreen Space card
  (`UnIcon name="hammer"` → `/judging`). Routes auto-register via file-based routing.
- `validateForSubmit()`: settled by the new plan — every criterion of the round is
  required to submit.
- Needs migrate deploy (Phase 1) + backend rebuild + **mobile native rebuild** (new
  screens). No new native modules, so a JS/OTA-style rebuild suffices for the screens
  themselves.

### Phase 4 — Mobile: participant view + notifications — **DONE 2026-09-25 (tsc backend+space+mobile, iOS bundle, 14 leaderboard tests; NOT deployed)**
- Mobile `app/competition/[eventId]` → `CompetitionScreen` (standing hero, Winners, My rounds,
  revealed panel feedback, round-by-round bracket). Pure logic in `src/lib/competition.ts`.
  Entry = "Competition" row on the ticket screen (only when the participant view is non-null).
- Backend: `getParticipantView` hides DRAFT boards and counts CLAIMED group seats as "mine".
  Pushes via `NotificationEvents.CompetitionUpdate` (category registrationUpdates, deep link
  `unifesto://competition/:eventId`): ADVANCED/ELIMINATED on a real status change, FEEDBACK
  on revealReviews false→true (teams with a submitted review only), AWARD on first publish.
  Copy in `competitionPushCopy()`. Never on DRAFT boards.
- Space: entrant dialog links a ticket via new `GET events/:id/leaderboard/registrants?q=`
  (manage-leaderboard cap, confirmed regs only); create/update reject another event's
  registration; `registrationId: null` unlinks. Without a link no one is "on" a team.
Participant sees, per event with a board: their round status (advanced/eliminated),
the public bracket, declared winners, and — when `revealReviews` is on — the written
feedback about their own team (no marks anywhere). Push on advance/eliminate and on
feedback reveal via OneSignal (`[[notifications-and-dashboards]]`).

---

## Deploy checklist

See the new plan §15.

---

## Deferred / out of scope

See the new plan §17.
