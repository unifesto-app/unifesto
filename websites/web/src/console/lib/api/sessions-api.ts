/**
 * Sessions API — organiser surface.
 * Backed by `/sessions` and `/spaces/:spaceId/sessions` endpoints.
 */

import backendClient, { apiCall } from "./backend-client";

export type SessionPlatform =
  | "GOOGLE_MEET"
  | "ZOOM"
  | "MS_TEAMS"
  | "OTHER"
  | "UNIFESTO_LIVE";
export type SessionStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "CANCELLED"
  | "COMPLETED";
export type SessionVisibility = "PUBLIC" | "UNLISTED";

export const PLATFORM_LABELS: Record<SessionPlatform, string> = {
  GOOGLE_MEET: "Google Meet",
  ZOOM: "Zoom",
  MS_TEAMS: "Microsoft Teams",
  OTHER: "Other",
  UNIFESTO_LIVE: "Unifesto Live (in-app)",
};

/** True for sessions hosted in-app via LiveKit (no external meeting URL). */
export function isLivePlatform(p: SessionPlatform): boolean {
  return p === "UNIFESTO_LIVE";
}

export interface Session {
  id: string;
  spaceId: string;
  slug: string;
  title: string;
  description?: string | null;
  coverImageUrl?: string | null;
  platform: SessionPlatform;
  meetingUrl?: string | null;
  platformOther?: string | null;
  interactive?: boolean;
  startDateTime: string;
  durationMinutes: number;
  timezone: string;
  capacity?: number | null;
  registeredCount: number;
  price: string | number;
  currency: string;
  status: SessionStatus;
  visibility: SessionVisibility;
  recordingUrl?: string | null;
  recordingEgressId?: string | null;
  cancelledAt?: string | null;
  /** Non-null when hidden. Only ever set on completed/cancelled sessions. */
  deletedAt?: string | null;
  cancellationReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * What `POST /sessions/:id/join` returns. Discriminated on `mode`:
 *  - "livekit": in-app live — connect to `serverUrl` with the per-user `token`
 *    (a LiveKit access token, not a URL) in the room component.
 *  - "external": Meet/Zoom/Teams — `meetingUrl` is the gated link.
 * Space Admins and curators receive `role: "host"`.
 */
export type JoinResult =
  | {
      mode: "livekit";
      platform: SessionPlatform;
      serverUrl: string;
      token: string;
      room: string;
      role: "host" | "viewer";
      canPublish: boolean;
    }
  | {
      mode: "external";
      platform: SessionPlatform;
      meetingUrl: string | null;
      role: "host" | "viewer";
    };

export interface SessionAttendee {
  id: string;
  paymentStatus: string;
  totalAmount: string | number;
  joinedAt?: string | null;
  registeredAt: string;
  user: {
    id: string;
    fullName?: string | null;
    username?: string | null;
    email?: string | null;
  };
}

export interface CreateSessionPayload {
  title: string;
  description?: string;
  coverImageUrl?: string;
  platform: SessionPlatform;
  /** Required for external platforms; omit for UNIFESTO_LIVE. */
  meetingUrl?: string;
  platformOther?: string;
  /** UNIFESTO_LIVE only: true = interactive, false = broadcast. Default true. */
  interactive?: boolean;
  startDateTime: string;
  durationMinutes?: number;
  timezone?: string;
  capacity?: number;
  price?: number;
  visibility?: SessionVisibility;
}

export type UpdateSessionPayload = Partial<
  Omit<CreateSessionPayload, "capacity">
> & {
  /** null clears the cap (unlimited). */
  capacity?: number | null;
};

/**
 * A space's sessions. `deleted` picks which side of the soft-delete line —
 * omitted means active only, so hidden sessions never appear unasked.
 */
export function listSpaceSessions(
  spaceId: string,
  deleted?: "active" | "deleted" | "all"
) {
  return apiCall<Session[]>(
    backendClient.get(`/spaces/${spaceId}/sessions`, {
      params: deleted ? { deleted } : undefined,
    })
  );
}

export function createSession(spaceId: string, payload: CreateSessionPayload) {
  return apiCall<Session>(
    backendClient.post(`/spaces/${spaceId}/sessions`, payload)
  );
}

export function updateSession(id: string, payload: UpdateSessionPayload) {
  return apiCall<Session>(backendClient.patch(`/sessions/${id}`, payload));
}

export function publishSession(id: string) {
  return apiCall<Session>(backendClient.post(`/sessions/${id}/publish`));
}

/** End a live session now: stops recording, closes the room, marks completed. */
export function completeSession(id: string) {
  return apiCall<Session>(backendClient.post(`/sessions/${id}/complete`));
}

/**
 * Hide a completed or cancelled session. Reversible: registrations, payments
 * and any recording are untouched and reappear on restore.
 */
export function hideSession(id: string) {
  return apiCall<{ hidden: boolean }>(
    backendClient.delete(`/sessions/${id}/hide`)
  );
}

/** Bring a hidden session back. */
export function restoreSession(id: string) {
  return apiCall<{ restored: boolean }>(
    backendClient.patch(`/sessions/${id}/restore`)
  );
}

/**
 * Permanently delete a draft or cancelled session. Irreversible, and refused
 * for a completed session — hide that instead.
 */
export function deleteSession(id: string) {
  return apiCall<{ deleted: boolean }>(
    backendClient.delete(`/sessions/${id}`)
  );
}

export function cancelSession(id: string, reason?: string) {
  return apiCall<{ cancelled: boolean; refunded: number; totalPaid: number }>(
    backendClient.post(`/sessions/${id}/cancel`, { reason })
  );
}

export function duplicateSession(id: string) {
  return apiCall<Session>(backendClient.post(`/sessions/${id}/duplicate`));
}

export function addSessionRecording(id: string, recordingUrl: string) {
  return apiCall<Session>(
    backendClient.post(`/sessions/${id}/recording`, { recordingUrl })
  );
}

export function getSessionAttendees(id: string) {
  return apiCall<SessionAttendee[]>(
    backendClient.get(`/sessions/${id}/attendees`)
  );
}

export interface SessionCoHost {
  id: string;
  userId: string;
  createdAt: string;
  fullName?: string | null;
  username?: string | null;
  email?: string | null;
}

export function getSessionCoHosts(id: string) {
  return apiCall<SessionCoHost[]>(backendClient.get(`/sessions/${id}/cohosts`));
}

/** Add a co-host by the email of an existing Unifesto user. */
export function addSessionCoHost(id: string, email: string) {
  return apiCall<SessionCoHost[]>(
    backendClient.post(`/sessions/${id}/cohosts`, { email })
  );
}

export function removeSessionCoHost(id: string, coHostUserId: string) {
  return apiCall<SessionCoHost[]>(
    backendClient.delete(`/sessions/${id}/cohosts/${coHostUserId}`)
  );
}

/**
 * Resolve join access. For an organiser this returns a `host` credential — for
 * live sessions a per-user LiveKit token to host the room, for external ones the
 * meeting URL. Fails (with the server message) outside the allowed window for
 * non-hosts; hosts may open the room early.
 */
export function joinSession(id: string) {
  return apiCall<JoinResult>(backendClient.post(`/sessions/${id}/join`));
}

/** Organiser: start recording a live session (LiveKit Egress → S3). */
export function startSessionRecording(id: string) {
  return apiCall<{ recording: boolean }>(
    backendClient.post(`/sessions/${id}/recording/start`)
  );
}

/** Organiser: stop an in-flight recording. The file URL arrives via webhook. */
export function stopSessionRecording(id: string) {
  return apiCall<{ stopped: boolean }>(
    backendClient.post(`/sessions/${id}/recording/stop`)
  );
}

/** Convenience: the single session from the organiser list (no dedicated by-id endpoint). */
export async function getSpaceSessionById(spaceId: string, id: string) {
  const { data, error } = await listSpaceSessions(spaceId);
  if (error) return { data: null, error };
  return { data: data?.find((s) => s.id === id) ?? null, error: null };
}
