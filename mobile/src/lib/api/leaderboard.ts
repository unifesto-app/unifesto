/**
 * Judge / mentor scoring API client (Phase 3 of the hackathon-dashboard merge).
 *
 * Panelists (JUDGE / MENTOR) score and review entrants from mobile. The privacy
 * model is enforced server-side, not here: a panelist only ever receives their
 * OWN cells/review, and once a round is CLOSED the read endpoint 403s. This
 * client mirrors that — it never assembles another panelist's data and it treats
 * a closed round as a locked, read-only state rather than an error to retry.
 *
 * Hackathon curator tools (rounds, judges, queues, results, winners,
 * certificates) are in the app too, in src/lib/api/hackathon.ts.
 */

import { makeAuthenticatedRequest } from './helpers';
import { call } from './manageEvent';
import { OFFLINE_MESSAGE } from './errors';

export type PanelistKind = 'JUDGE' | 'MENTOR';
export type RoundStatus = 'PENDING' | 'ACTIVE' | 'CLOSED';

/** One event where the signed-in user is a judge/mentor (the "Judging" list). */
export interface JudgingEvent {
  boardId: string;
  boardTitle: string | null;
  /** Hackathon boards open the judge console instead of the list. */
  isHackathon?: boolean;
  kind: PanelistKind;
  totalRounds: number;
  activeRounds: number;
  eventId: string;
  title: string;
  slug: string;
  startDateTime: string;
  endDateTime: string;
  coverImageUrl: string | null;
  venueName: string | null;
  city: string | null;
  space: { id: string; name: string } | null;
}

export interface JudgingMetric {
  id: string;
  key: string;
  label: string;
  /** null = applies to every round; otherwise scoped to one round. */
  roundId: string | null;
  minValue: number;
  maxValue: number;
  weight: number;
}

/** An entrant in scope for one round, with this panelist's own review state. */
export interface AssignmentEntrant {
  id: string;
  name: string;
  meta: Record<string, unknown> | null;
  /** Whether THIS panelist has already submitted their review for this round. */
  reviewed: boolean;
}

export interface AssignmentRound {
  id: string;
  name: string;
  order: number;
  status: RoundStatus;
  /** Empty when the round is CLOSED (server read-locks it) or none are in scope. */
  entrants: AssignmentEntrant[];
}

export interface MyAssignments {
  boardId: string;
  eventId: string;
  title: string | null;
  isHackathon?: boolean;
  kind: PanelistKind;
  metrics: JudgingMetric[];
  rounds: AssignmentRound[];
}

/** This panelist's own scores + review for one entrant/round. */
export interface MyJudgment {
  entrantId: string;
  roundId: string;
  kind: PanelistKind;
  scores: { metricId: string; value: number; comment: string | null }[];
  overallReview: string | null;
  submittedAt: string | null;
  /** Hackathon: marks can change until then (5 min after submit or a reopen). */
  editableUntil?: string | null;
  locked?: boolean;
  /** Hackathon: the team and the judge's running slot with it. */
  hackathon?: {
    teamCode: string | null;
    teamName: string;
    members: string[];
    room: { name: string; location: string | null } | null;
    statement: { source: 'LIST' | 'OWN'; code: string | null; title: string; description: string; themeLabel: string | null } | null;
    round: { name: string; slotMinutes: number; judgingMode: string; kind?: 'EVALUATION' | 'MENTORING' } | null;
    /** The team's project links for this round. */
    links?: { label: string; url: string }[];
    linksNotes?: string | null;
    slot: {
      requestId: string;
      status: string;
      calledAt: string | null;
      startedAt: string | null;
      slotEndsAt: string | null;
      panelName: string | null;
    } | null;
  } | null;
}

export interface ScoreCell {
  metricId: string;
  value: number;
  comment?: string;
}

export interface SubmitJudgmentPayload {
  roundId: string;
  /** JUDGE only — mentors must omit scores or the server rejects the request. */
  scores?: ScoreCell[];
  overallReview?: string;
  /** true = mark complete (sets submittedAt); false/undefined = save draft. */
  submit?: boolean;
}

/** Every event where the current user is on a panel. Empty on any failure. */
export async function getMyJudgingEvents(): Promise<JudgingEvent[]> {
  const response = await makeAuthenticatedRequest('/leaderboard/my-judging-events');
  if (!response?.ok) return [];
  try {
    const data = await response.json();
    return Array.isArray(data?.events) ? (data.events as JudgingEvent[]) : [];
  } catch {
    return [];
  }
}

/**
 * This panelist's rounds + entrants for one event. Returns null when they hold
 * no assignment on the event (also the server's response) or on any failure.
 */
export async function getMyAssignments(eventId: string): Promise<MyAssignments | null> {
  const response = await makeAuthenticatedRequest(
    `/events/${eventId}/leaderboard/my-assignments`,
  );
  if (!response?.ok) return null;
  try {
    const data = await response.json();
    return data ?? null;
  } catch {
    return null;
  }
}

export type JudgmentResult =
  | { ok: true; data: MyJudgment }
  | { ok: false; locked: boolean; message: string };

/**
 * This panelist's own cells + review for an entrant/round. A 403 means the round
 * is closed (or they're off the panel) — surfaced as `locked` so the screen can
 * show a read-only "this round is closed" state instead of an error toast.
 */
export async function getMyJudgment(
  entrantId: string,
  roundId: string,
): Promise<JudgmentResult> {
  const response = await makeAuthenticatedRequest(
    `/leaderboard/entrants/${entrantId}/judgment/${roundId}`,
  );
  if (!response) {
    return { ok: false, locked: false, message: OFFLINE_MESSAGE };
  }
  if (response.ok) {
    try {
      return { ok: true, data: (await response.json()) as MyJudgment };
    } catch {
      return { ok: false, locked: false, message: 'Could not read your scores.' };
    }
  }
  const locked = response.status === 403;
  let message = locked
    ? 'This round is closed — your scores are locked.'
    : 'Could not load this entrant. Please try again.';
  try {
    const body = await response.json();
    if (body?.message) message = String(body.message);
  } catch {
    /* keep default */
  }
  return { ok: false, locked, message };
}

/**
 * Save or submit this panelist's judgment. Surfaces the backend's reason on 4xx;
 * `locked` = the hackathon 5-minute window has closed.
 */
export async function submitJudgment(
  entrantId: string,
  payload: SubmitJudgmentPayload,
): Promise<{ ok: boolean; message?: string; locked?: boolean; submittedAt?: string | null; editableUntil?: string | null }> {
  const response = await makeAuthenticatedRequest(
    `/leaderboard/entrants/${entrantId}/judgment`,
    // Upserted server-side, so retrying a dropped submit can't double-score.
    { method: 'POST', body: JSON.stringify(payload), retry: true },
  );
  if (!response) return { ok: false, message: OFFLINE_MESSAGE };
  if (response.ok) {
    try {
      const body = await response.json();
      return { ok: true, submittedAt: body?.submittedAt ?? null, editableUntil: body?.editableUntil ?? null };
    } catch {
      return { ok: true };
    }
  }
  let message = 'Could not save. Please try again.';
  let locked = false;
  try {
    const body = await response.json();
    if (body?.message) message = String(body.message);
    locked = body?.code === 'JUDGMENT_LOCKED';
  } catch {
    /* keep default */
  }
  return { ok: false, message, locked };
}

// ── Participant view (Phase 4) ──────────────────────────────────────────────
// What a team sees: per-round advance/eliminate, the bracket, published awards,
// and — only once the organiser reveals it — the panel's written feedback about
// their own team. The server never sends marks on this path.

export type EntrantRoundStatus = 'PENDING' | 'ADVANCED' | 'ELIMINATED';

export interface ParticipantRound {
  id: string;
  name: string;
  order: number;
  status: RoundStatus;
  entrants: { id: string; name: string; teamCode?: string | null; isMine: boolean; status: EntrantRoundStatus }[];
}

export interface ParticipantView {
  eventId: string;
  title: string | null;
  mode: 'RUBRIC' | 'METRIC';
  isHackathon?: boolean;
  revealReviews: boolean;
  myEntrantIds: string[];
  rounds: ParticipantRound[];
  awards: {
    id: string;
    title: string;
    entrantId: string;
    entrantName: string | null;
    teamCode?: string | null;
    /** Hackathon: why they won. */
    notes?: string | null;
    isMine: boolean;
  }[];
  feedback: { roundId: string; entrantId: string; overallReview: string | null }[];
}

/**
 * GET /leaderboards/:eventId/participant. `data: null` = no competition to show
 * (no board, disabled, or still a draft).
 */
export const getParticipantView = (eventId: string) =>
  call<ParticipantView | null>(`/leaderboards/${eventId}/participant`);
