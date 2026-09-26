/**
 * Sessions API — attendee surface.
 * Online-only gatherings owned by a Space. The meeting link is gated: it is
 * ONLY returned by `joinSession`, and only for a paid+registered user inside
 * the join window.
 */

import { makeAuthenticatedRequest, makePublicRequest } from './helpers';

export type SessionPlatform =
  | 'GOOGLE_MEET'
  | 'ZOOM'
  | 'MS_TEAMS'
  | 'OTHER'
  | 'UNIFESTO_LIVE';
export type SessionStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'CANCELLED'
  | 'COMPLETED';

export const PLATFORM_LABELS: Record<SessionPlatform, string> = {
  GOOGLE_MEET: 'Google Meet',
  ZOOM: 'Zoom',
  MS_TEAMS: 'Microsoft Teams',
  OTHER: 'Online',
  UNIFESTO_LIVE: 'Unifesto Live',
};

/** True for sessions hosted in-app via LiveKit (no external URL to open). */
export function isLiveSession(platform: SessionPlatform): boolean {
  return platform === 'UNIFESTO_LIVE';
}

export interface Session {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  platform: SessionPlatform;
  platformOther: string | null;
  startDateTime: string;
  durationMinutes: number;
  timezone: string;
  capacity: number | null;
  registeredCount: number;
  price: string | number;
  currency: string;
  status: SessionStatus;
  visibility: 'PUBLIC' | 'UNLISTED';
  recordingUrl: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  space?: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
}

export interface MySessionRegistration {
  id: string;
  paymentStatus: string;
  joinedAt: string | null;
  registeredAt: string;
  session: Session;
}

/** register() returns this — free completes immediately, paid needs checkout. */
export interface SessionRegisterResponse {
  registrationId: string;
  needsPayment: boolean;
  razorpayOrderId?: string;
  razorpayKeyId?: string;
  amount?: number; // paise
  currency?: string;
  basePrice?: number;
  processingFee?: number;
  totalAmount?: number;
}

export interface VerifySessionPaymentInput {
  registrationId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}

export async function listSessions(): Promise<Session[]> {
  const response = await makePublicRequest('/sessions');
  if (!response?.ok) return [];
  return response.json() as Promise<Session[]>;
}

export async function getSessionBySlug(slug: string): Promise<Session | null> {
  const response = await makePublicRequest(`/sessions/${slug}`);
  if (!response?.ok) return null;
  return response.json() as Promise<Session>;
}

export async function getMySessions(): Promise<MySessionRegistration[]> {
  const response = await makeAuthenticatedRequest('/me/sessions');
  if (!response?.ok) return [];
  return response.json() as Promise<MySessionRegistration[]>;
}

export async function registerForSession(
  sessionId: string
): Promise<SessionRegisterResponse> {
  const response = await makeAuthenticatedRequest(
    `/sessions/${sessionId}/register`,
    { method: 'POST' }
  );
  if (!response?.ok) {
    throw new Error(await errorMessage(response, 'Could not register'));
  }
  return response.json() as Promise<SessionRegisterResponse>;
}

export async function verifySessionPayment(
  input: VerifySessionPaymentInput
): Promise<{ registrationId: string; paid: boolean }> {
  const response = await makeAuthenticatedRequest('/sessions/register/verify', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!response?.ok) {
    throw new Error(await errorMessage(response, 'Could not verify payment'));
  }
  return response.json();
}

/**
 * Result of POST /sessions/:id/join. Discriminated on `mode`:
 *  - 'livekit': in-app live session — connect to `serverUrl` with the per-user
 *    `token` (a LiveKit access token, not a URL). Feed both to the room screen.
 *  - 'external': Meet/Zoom/Teams — `meetingUrl` is the gated link to open.
 */
export type JoinResult =
  | {
      mode: 'livekit';
      platform: SessionPlatform;
      serverUrl: string;
      token: string;
      room: string;
      role: 'host' | 'viewer';
      canPublish: boolean;
    }
  | {
      mode: 'external';
      platform: SessionPlatform;
      meetingUrl: string | null;
      role: 'host' | 'viewer';
    };

/**
 * Resolve join access. Throws with the server's message when the join window
 * isn't open yet (or the caller isn't a paid registrant), so the screen can
 * show "opens at …" rather than a dead button.
 */
export async function joinSession(sessionId: string): Promise<JoinResult> {
  const response = await makeAuthenticatedRequest(
    `/sessions/${sessionId}/join`,
    { method: 'POST' }
  );
  if (!response?.ok) {
    throw new Error(await errorMessage(response, 'Cannot join yet'));
  }
  return response.json() as Promise<JoinResult>;
}

/** Pull the backend's error message (Nest returns `{ message }`) if present. */
async function errorMessage(
  response: Response | null,
  fallback: string
): Promise<string> {
  if (!response) return 'Network error — please try again';
  try {
    const body = await response.json();
    const msg = body?.message;
    return Array.isArray(msg) ? msg.join(', ') : msg || fallback;
  } catch {
    return fallback;
  }
}
