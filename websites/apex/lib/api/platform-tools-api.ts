/**
 * Platform tools that were mobile-only (B8): OTA rollouts, default images,
 * Unifesto Stats recipients, the outside uptime view, seat-count reconcile.
 * Same endpoints the mobile Apex screens use (mobile/src/lib/api/apex.ts).
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

// ── OTA updates (EAS Update, through the backend's Expo token) ───────────────

export type OtaChannel = "production" | "preview";

export interface OtaGroup {
  group: string;
  message: string | null;
  createdAt: string;
  runtimeVersion: string;
  platforms: string[];
  updateIds: string[];
  /** null when not a staged rollout. */
  rolloutPercentage: number | null;
  controlGroup: string | null;
  isRollBackToEmbedded: boolean;
  gitCommitHash: string | null;
  publishedBy: string | null;
}

export interface OtaAdoption {
  days: number;
  total: number;
  /** runtimeVersion null = clients too old to report one. */
  byRuntime: { runtimeVersion: string | null; users: number }[];
  /** updateId null = running the store build's own code. */
  byUpdate: { runtimeVersion: string; updateId: string | null; users: number }[];
}

export interface OtaStaleness {
  main: { sha: string; otaSafe: boolean; reportedAt: string } | null;
  lastPublish: { group: string; createdAt: string; message: string | null } | null;
  unshippedCommits: number | null;
  unshippedTruncated: boolean;
  oldestUnshippedAt: string | null;
  expoError: string | null;
}

export const getOtaGroups = (channel: OtaChannel): Result<{ channel: OtaChannel; groups: OtaGroup[] }> =>
  apiCall(backendClient.get("/admin/ota", { params: { channel } }));
/** 100 finishes the rollout. */
export const setOtaRollout = (group: string, percentage: number): Result<{ ok: true }> =>
  apiCall(backendClient.post(`/admin/ota/${group}/rollout`, { percentage }));
/** Deletes the rollout and republishes the update before it. */
export const revertOtaRollout = (group: string): Result<{ ok: true }> =>
  apiCall(backendClient.post(`/admin/ota/${group}/revert`, {}));
/** Makes an earlier update the newest again (roll back). */
export const republishOtaGroup = (group: string): Result<{ ok: true }> =>
  apiCall(backendClient.post(`/admin/ota/${group}/republish`, {}));
export const getOtaAdoption = (): Result<OtaAdoption> => apiCall(backendClient.get("/admin/ota/adoption"));
export const getOtaStaleness = (): Result<OtaStaleness> => apiCall(backendClient.get("/admin/ota/staleness"));

// ── Default images ───────────────────────────────────────────────────────────

export type DefaultImageKind = "BANNER" | "LOGO";

export interface DefaultImageRow {
  id: string;
  kind: DefaultImageKind;
  url: string;
  createdAt: string;
}

export const getDefaultImages = (): Result<DefaultImageRow[]> => apiCall(backendClient.get("/admin/default-images"));

export function addDefaultImage(kind: DefaultImageKind, file: File): Result<DefaultImageRow> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  return apiCall(backendClient.post("/admin/default-images", form, { headers: { "Content-Type": "multipart/form-data" } }));
}

export const deleteDefaultImage = (id: string): Result<{ success: boolean }> =>
  apiCall(backendClient.delete(`/admin/default-images/${id}`));

// ── Unifesto Stats recipients ────────────────────────────────────────────────

export const getStatsRecipients = (): Result<{ numbers: string[] }> => apiCall(backendClient.get("/admin/stats-recipients"));
/** Full replacement; the server normalises to E.164. */
export const updateStatsRecipients = (numbers: string[]): Result<{ numbers: string[] }> =>
  apiCall(backendClient.put("/admin/stats-recipients", { numbers }));

// ── Outside uptime view (UptimeRobot, read-only key on the server) ───────────

export interface ExternalMonitor {
  id: number;
  name: string;
  url: string | null;
  status: "up" | "down" | "degraded" | "paused" | "unknown";
  uptime: { day: number | null; week: number | null; month: number | null };
  responseMs: number | null;
  lastDown: { at: string; durationSec: number; reason: string | null } | null;
}

export interface ExternalStatus {
  configured: boolean;
  fetchedAt: string | null;
  error: string | null;
  monitors: ExternalMonitor[];
}

export const getExternalStatus = (): Result<ExternalStatus> => apiCall(backendClient.get("/admin/status/external"));

// ── Maintenance ──────────────────────────────────────────────────────────────

/** Recount event and ticket seat counters (groups count as groupSize). Idempotent. */
export const reconcileSeatCounts = (): Result<{ success: boolean; ticketTypesReset: number; eventsReset: number }> =>
  apiCall(backendClient.post("/admin/reconcile-seat-counts", {}));

// ── Unifesto Orbit (campus programme) ────────────────────────────────────────

export type OrbitTierName = "Probation" | "Lead" | "Bronze" | "Silver" | "Gold";
export type OrbitClockStatus = "active" | "paused" | "check-in" | "reopen";

export interface OrbitLeadRow {
  id: string;
  user: { id: string; fullName: string | null; username: string | null; email: string | null };
  joinedAt: string;
  examPauseUntil: string | null;
  probationEndsAt: string;
}

export interface OrbitCampus {
  spaceId: string;
  name: string;
  slug: string;
  verified: boolean;
  leads: OrbitLeadRow[];
  clubs: number;
  /** Clubs with at least one published event. */
  activeClubs: number;
  publishedEvents: number;
  paidEvents: number;
  paidRegistrations: number;
  gmv: number;
  platformEarnings: number;
  tier: number;
  tierName: OrbitTierName;
  lastActivityAt: string | null;
  /** Null when the campus has no Orbit Lead. */
  clock: { inactiveDays: number; status: OrbitClockStatus } | null;
}

export const getOrbitLeaderboard = (): Result<{ campuses: OrbitCampus[] }> =>
  apiCall(backendClient.get("/orbit/admin/leaderboard"));
/** Also makes them Space Admin of the campus. They need a Unifesto account. */
export const appointOrbitLead = (spaceId: string, email: string): Result<{ id: string }> =>
  apiCall(backendClient.post("/orbit/admin/leads", { spaceId, email }));
/** Removes their campus admin access; the row stays as history. */
export const endOrbitLead = (id: string, reason?: string): Result<{ id: string }> =>
  apiCall(backendClient.patch(`/orbit/admin/leads/${id}/end`, { reason }));
export interface OrbitApplication {
  id: string;
  status: "PENDING" | "APPOINTED" | "DECLINED";
  collegeName: string;
  yearOfStudy: string;
  myClubs: string;
  campusClubs: string;
  why: string;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  /** The campus they picked; null when theirs isn't on Unifesto yet. */
  space: { id: string; name: string } | null;
  user: { id: string; fullName: string | null; mobileNumber: string; identities: { email: string | null }[] };
}

export const getOrbitApplications = (): Result<OrbitApplication[]> =>
  apiCall(backendClient.get("/orbit/admin/applications"));
/** Makes them Orbit Lead (and Space Admin) of the chosen campus. */
export const appointOrbitApplication = (id: string, spaceId: string): Result<{ id: string }> =>
  apiCall(backendClient.post(`/orbit/admin/applications/${id}/appoint`, { spaceId }));
export const declineOrbitApplication = (id: string, note?: string): Result<{ id: string }> =>
  apiCall(backendClient.patch(`/orbit/admin/applications/${id}/decline`, { note }));

/** A declared exam window pauses the inactivity clock; null clears it. */
export const setOrbitExamPause = (id: string, until: string | null): Result<{ id: string }> =>
  apiCall(backendClient.patch(`/orbit/admin/leads/${id}/exam-pause`, { until }));
