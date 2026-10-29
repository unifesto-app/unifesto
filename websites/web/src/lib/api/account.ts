import { ApiError, call } from "@/lib/api/registration";
import { mapEvent, type Event } from "@/lib/api/events";

/* K19: the web account pages. The same endpoints the app uses. */

const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL || "https://api.unifesto.app";

export interface Me {
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
  /** Set while a deletion request is pending: when the account closes. */
  deletionScheduledFor: string | null;
}

export const getMe = (token: string) => call<Me>("GET", "/users/me", undefined, token);
export const updateMe = (token: string, body: { fullName?: string; username?: string }) =>
  call<Me>("PATCH", "/users/me", body, token);
export const checkUsername = (username: string) =>
  call<{ available: boolean }>("POST", "/users/check-username", { username });

/** JPG, PNG or WebP up to 5 MB (the API checks both too). */
export async function uploadAvatar(token: string, file: File): Promise<string> {
  const body = new FormData();
  body.append("avatar", file);
  const res = await fetch(`${PUBLIC_API}/users/me/avatar`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((Array.isArray(data?.message) ? data.message[0] : data?.message) || "Couldn't upload the photo.", res.status);
  return data.avatarUrl as string;
}

export interface NotificationSettings {
  emailEnabled: boolean;
  registrationUpdates: boolean;
  emailEventReminders: boolean;
  emailNewEvents: boolean;
  promotions: boolean;
  /** null when there's no address on file to opt out of. */
  marketingEmail: boolean | null;
  marketingWhatsapp: boolean | null;
  spaceOptOuts: { spaceId: string; spaceName: string }[];
}

export const getNotificationSettings = (token: string) =>
  call<NotificationSettings>("GET", "/users/me/notification-settings", undefined, token);
export const updateNotificationSettings = (token: string, patch: Partial<NotificationSettings>) =>
  call<NotificationSettings>("PATCH", "/users/me/notification-settings", patch, token);
export const resubscribeToSpace = (token: string, spaceId: string) =>
  call<NotificationSettings>("DELETE", `/users/me/notification-settings/space-opt-outs/${spaceId}`, undefined, token);

/** Starts the 30-day grace period; the API refuses (409) while something blocks closing. */
export const requestDeletion = (token: string) =>
  call<{ deletionScheduledFor: string | null }>("DELETE", "/users/me", undefined, token);
export const cancelDeletion = (token: string) =>
  call<{ deletionScheduledFor: null }>("POST", "/users/me/deletion/cancel", undefined, token);

export async function getSavedEvents(token: string): Promise<Event[]> {
  const rows = await call<Record<string, unknown>[]>("GET", "/favorites", undefined, token);
  return rows.map((r) => mapEvent(r)).filter((e): e is Event => !!e);
}
export const unsaveEvent = (token: string, eventId: string) => call("DELETE", `/events/${eventId}/favorite`, undefined, token);

export interface MyCertificate {
  id: string;
  certificateNumber: string;
  verificationCode: string;
  pdfUrl: string | null;
  imageUrl: string | null;
  issuedAt: string;
  event: { id: string; title: string; slug: string };
}
export const getMyCertificates = (token: string) => call<MyCertificate[]>("GET", "/certificates/mine", undefined, token);
