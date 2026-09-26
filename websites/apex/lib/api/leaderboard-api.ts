/**
 * Leaderboard (competitive dashboard) API — the setup itself lives in the hack
 * app; Apex only reads a board's status to show whether an event's leaderboard
 * is set up and to route the organiser to the right place.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type LeaderboardMode = "RUBRIC" | "METRIC";
export type LeaderboardStatus = "DRAFT" | "LIVE" | "FROZEN" | "FINAL";
export type LeaderboardEntrantKind = "TEAM" | "INDIVIDUAL";
export type LeaderboardVisibility = "PUBLIC" | "PARTICIPANTS_ONLY";

export interface LeaderboardManage {
  id: string;
  eventId: string;
  mode: LeaderboardMode;
  entrantKind: LeaderboardEntrantKind;
  visibility: LeaderboardVisibility;
  status: LeaderboardStatus;
  enabled: boolean;
  title: string | null;
  description: string | null;
  metrics: unknown[];
  entrants: unknown[];
}

/**
 * `GET /events/:eventId/leaderboard/manage`. Returns the board (with metrics +
 * entrants) or `null` when none has been created yet. 403 if the caller can't
 * manage the event.
 */
export async function getLeaderboardManage(
  eventId: string
): Promise<{ data: LeaderboardManage | null; error: ApiError | null }> {
  return apiCall<LeaderboardManage | null>(
    backendClient.get(`/events/${eventId}/leaderboard/manage`)
  );
}
