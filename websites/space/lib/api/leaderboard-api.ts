/**
 * Leaderboard (competitive dashboard / hackathon) API.
 *
 * Backed by the NestJS `leaderboard` module. Curator management routes are
 * `/events/:eventId/leaderboard/*` and are gated server-side by
 * `event:manage-leaderboard` + the plan flag `hasLeaderboard`.
 *
 * Phase 2 (this file) replaces the old link-out to the standalone `hack` app:
 * the space console now drives the board directly. Panelist scoring/reviews and
 * the participant view live in mobile; the public bracket lives in web.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

// ── Enums (mirror `@prisma/client`) ─────────────────────────────────────────

export type LeaderboardMode = "RUBRIC" | "METRIC";
export type LeaderboardStatus = "DRAFT" | "LIVE" | "FROZEN" | "FINAL";
export type LeaderboardEntrantKind = "TEAM" | "INDIVIDUAL";
export type LeaderboardVisibility = "PUBLIC" | "PARTICIPANTS_ONLY";
export type LeaderboardTieBreak = "EARLIEST_SUBMISSION" | "PRIMARY_METRIC";
export type RoundStatus = "PENDING" | "ACTIVE" | "CLOSED";
export type EntrantRoundStatus = "PENDING" | "ADVANCED" | "ELIMINATED";
export type PanelistKind = "JUDGE" | "MENTOR";

// Prisma `Decimal`s arrive as strings (or numbers) over JSON — coerce with
// `Number()` at the display edge.
type Decimalish = number | string;

// ── Sub-records inside the manage view ───────────────────────────────────────

export interface LeaderboardMetric {
  id: string;
  leaderboardId: string;
  roundId: string | null;
  key: string;
  label: string;
  weight: Decimalish;
  minValue: Decimalish;
  maxValue: Decimalish;
  isPrimary: boolean;
  displayOrder: number;
}

export interface LeaderboardScore {
  id: string;
  entrantId: string;
  metricId: string;
  roundId: string;
  judgeUserId: string | null;
  value: Decimalish;
  comment: string | null;
}

export interface EntrantRound {
  id: string;
  entrantId: string;
  roundId: string;
  status: EntrantRoundStatus;
  roundScore: Decimalish | null;
  rank: number | null;
  decidedBy: string | null;
  decidedAt: string | null;
}

export interface Judgment {
  id: string;
  entrantId: string;
  roundId: string;
  panelistUserId: string;
  kind: PanelistKind;
  overallReview: string | null;
  /** Non-null once the panelist marks the review complete = "reviewed". */
  submittedAt: string | null;
}

export interface LeaderboardEntrant {
  id: string;
  leaderboardId: string;
  name: string;
  registrationId: string | null;
  userId: string | null;
  meta: Record<string, unknown> | null;
  totalScore: Decimalish;
  rank: number | null;
  scores: LeaderboardScore[];
  entrantRounds: EntrantRound[];
  judgments: Judgment[];
}

export interface LeaderboardRound {
  id: string;
  leaderboardId: string;
  name: string;
  order: number;
  status: RoundStatus;
  startAt: string | null;
  endAt: string | null;
}

export interface PanelistUser {
  id: string;
  fullName: string | null;
  username: string | null;
}

export interface Panelist {
  id: string;
  leaderboardId: string;
  userId: string;
  kind: PanelistKind;
  roundId: string | null;
  entrantId: string | null;
  /** Hydrated by the backend from the soft-ref `userId` (may be null). */
  user: PanelistUser | null;
}

export interface Award {
  id: string;
  leaderboardId: string;
  entrantId: string;
  title: string;
  order: number;
  published: boolean;
  declaredBy: string | null;
  declaredAt: string | null;
}

/** Full curator view — `GET /events/:eventId/leaderboard/manage`. */
export interface LeaderboardManage {
  id: string;
  eventId: string;
  mode: LeaderboardMode;
  entrantKind: LeaderboardEntrantKind;
  visibility: LeaderboardVisibility;
  status: LeaderboardStatus;
  enabled: boolean;
  revealReviews: boolean;
  title: string | null;
  description: string | null;
  tieBreak: LeaderboardTieBreak;
  tieBreakMetricId: string | null;
  rounds: LeaderboardRound[];
  metrics: LeaderboardMetric[];
  entrants: LeaderboardEntrant[];
  panelists: Panelist[];
  awards: Award[];
}

// ── Payload shapes (mirror the backend DTOs) ─────────────────────────────────

export interface CreateLeaderboardInput {
  mode: LeaderboardMode;
  entrantKind?: LeaderboardEntrantKind;
  visibility?: LeaderboardVisibility;
  title?: string;
  description?: string;
  tieBreak?: LeaderboardTieBreak;
  tieBreakMetricId?: string;
}

export interface UpdateLeaderboardInput {
  entrantKind?: LeaderboardEntrantKind;
  visibility?: LeaderboardVisibility;
  status?: LeaderboardStatus;
  enabled?: boolean;
  revealReviews?: boolean;
  title?: string;
  description?: string;
  tieBreak?: LeaderboardTieBreak;
  tieBreakMetricId?: string;
}

export interface UpsertMetricInput {
  key: string;
  label: string;
  weight?: number;
  minValue?: number;
  maxValue?: number;
  isPrimary?: boolean;
  displayOrder?: number;
  roundId?: string;
}

export interface CreateEntrantInput {
  name: string;
  registrationId?: string;
  userId?: string;
  meta?: Record<string, unknown>;
}

export type UpdateEntrantInput = Partial<Omit<CreateEntrantInput, "registrationId">> & {
  /** null unlinks the entrant from its ticket. */
  registrationId?: string | null;
};

/** A confirmed booking an entrant can be linked to (its team then sees standings + gets pushes). */
export interface LinkableRegistration {
  registrationId: string;
  name: string;
  email: string | null;
  groupSize: number | null;
  /** Name of the entrant already linked to this booking, if any. */
  linkedTo: string | null;
}

export interface AssignPanelistInput {
  /** Provide `userId` OR `email` (invite-by-email find-or-creates the account). */
  userId?: string;
  email?: string;
  name?: string;
  kind: PanelistKind;
  roundId?: string;
  entrantId?: string;
}

export interface CreateAwardInput {
  entrantId: string;
  title: string;
  order?: number;
}

export type UpdateAwardInput = Partial<Omit<CreateAwardInput, "entrantId">> & {
  entrantId?: string;
};

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

// ── Board lifecycle ──────────────────────────────────────────────────────────

/** `null` data (no error) means "no board created yet" → show the setup CTA. */
export function getLeaderboardManage(eventId: string): Result<LeaderboardManage> {
  return apiCall<LeaderboardManage | null>(
    backendClient.get(`/events/${eventId}/leaderboard/manage`)
  ) as Result<LeaderboardManage>;
}

export function createLeaderboard(
  eventId: string,
  input: CreateLeaderboardInput
): Result<LeaderboardManage> {
  return apiCall(backendClient.post(`/events/${eventId}/leaderboard`, input));
}

export function updateLeaderboard(
  eventId: string,
  input: UpdateLeaderboardInput
): Result<LeaderboardManage> {
  return apiCall(backendClient.patch(`/events/${eventId}/leaderboard`, input));
}

// ── Rounds ─────────────────────────────────────────────────────────────────

export function createRound(
  eventId: string,
  input: { name: string; order?: number }
): Result<LeaderboardRound> {
  return apiCall(backendClient.post(`/events/${eventId}/leaderboard/rounds`, input));
}

export function updateRound(
  eventId: string,
  roundId: string,
  input: { name: string }
): Result<LeaderboardRound> {
  return apiCall(
    backendClient.patch(`/events/${eventId}/leaderboard/rounds/${roundId}`, input)
  );
}

export function reorderRounds(eventId: string, roundIds: string[]): Result<unknown> {
  return apiCall(
    backendClient.post(`/events/${eventId}/leaderboard/rounds/reorder`, { roundIds })
  );
}

export function setRoundStatus(
  eventId: string,
  roundId: string,
  status: RoundStatus
): Result<LeaderboardRound> {
  return apiCall(
    backendClient.patch(`/events/${eventId}/leaderboard/rounds/${roundId}/status`, {
      status,
    })
  );
}

export function deleteRound(eventId: string, roundId: string): Result<unknown> {
  return apiCall(
    backendClient.delete(`/events/${eventId}/leaderboard/rounds/${roundId}`)
  );
}

// ── Metrics / criteria ───────────────────────────────────────────────────────

export function upsertMetric(
  eventId: string,
  input: UpsertMetricInput
): Result<LeaderboardMetric> {
  return apiCall(backendClient.put(`/events/${eventId}/leaderboard/metrics`, input));
}

export function deleteMetric(eventId: string, metricId: string): Result<unknown> {
  return apiCall(
    backendClient.delete(`/events/${eventId}/leaderboard/metrics/${metricId}`)
  );
}

// ── Entrants ─────────────────────────────────────────────────────────────────

export function createEntrant(
  eventId: string,
  input: CreateEntrantInput
): Result<LeaderboardEntrant> {
  return apiCall(backendClient.post(`/events/${eventId}/leaderboard/entrants`, input));
}

export function updateEntrant(
  eventId: string,
  entrantId: string,
  input: UpdateEntrantInput
): Result<LeaderboardEntrant> {
  return apiCall(
    backendClient.patch(`/events/${eventId}/leaderboard/entrants/${entrantId}`, input)
  );
}

export function searchRegistrants(
  eventId: string,
  q: string
): Result<LinkableRegistration[]> {
  return apiCall(
    backendClient.get(`/events/${eventId}/leaderboard/registrants`, { params: { q } })
  );
}

export function deleteEntrant(eventId: string, entrantId: string): Result<unknown> {
  return apiCall(
    backendClient.delete(`/events/${eventId}/leaderboard/entrants/${entrantId}`)
  );
}

/** Manual advance / eliminate — the source of truth for the attendee bracket. */
export function setEntrantRoundStatus(
  eventId: string,
  entrantId: string,
  roundId: string,
  status: EntrantRoundStatus
): Result<unknown> {
  return apiCall(
    backendClient.put(
      `/events/${eventId}/leaderboard/entrants/${entrantId}/round-status`,
      { roundId, status }
    )
  );
}

// ── Panelists (judges / mentors) ─────────────────────────────────────────────

export function assignPanelist(
  eventId: string,
  input: AssignPanelistInput
): Result<Panelist> {
  return apiCall(backendClient.post(`/events/${eventId}/leaderboard/panelists`, input));
}

export function removePanelist(eventId: string, panelistId: string): Result<unknown> {
  return apiCall(
    backendClient.delete(`/events/${eventId}/leaderboard/panelists/${panelistId}`)
  );
}

// ── Awards ───────────────────────────────────────────────────────────────────

export function createAward(
  eventId: string,
  input: CreateAwardInput
): Result<Award> {
  return apiCall(backendClient.post(`/events/${eventId}/leaderboard/awards`, input));
}

export function updateAward(
  eventId: string,
  awardId: string,
  input: UpdateAwardInput
): Result<Award> {
  return apiCall(
    backendClient.patch(`/events/${eventId}/leaderboard/awards/${awardId}`, input)
  );
}

export function setAwardPublished(
  eventId: string,
  awardId: string,
  published: boolean
): Result<Award> {
  return apiCall(
    backendClient.patch(`/events/${eventId}/leaderboard/awards/${awardId}/publish`, {
      published,
    })
  );
}

export function deleteAward(eventId: string, awardId: string): Result<unknown> {
  return apiCall(
    backendClient.delete(`/events/${eventId}/leaderboard/awards/${awardId}`)
  );
}
