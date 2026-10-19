import { errorFrom, makeAuthenticatedRequest } from './helpers';

export interface NotificationSettings {
  pushEnabled: boolean;
  emailEnabled: boolean;
  eventReminders: boolean;
  newEvents: boolean;
  productUpdates: boolean;
  promotions: boolean;
  /** Tickets, waitlist offers, group and hackathon changes. */
  registrationUpdates: boolean;
  /** Messages a host sends to an event's attendees. */
  organiserAnnouncements: boolean;
  /** Space approvals and changes to spaces I run. */
  spaceUpdates: boolean;
  /** Email switches for the categories whose email is optional. */
  emailEventReminders: boolean;
  emailNewEvents: boolean;
  /** All marketing on a channel, from Unifesto and from spaces. null = no address on file. */
  marketingEmail: boolean | null;
  marketingWhatsapp: boolean | null;
  /** Quiet hours in minutes after midnight IST; null = off. */
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  /** Spaces whose marketing email I unsubscribed from (read-only). */
  spaceOptOuts: { spaceId: string; spaceName: string }[];
}

/** Re-subscribe to one space's marketing email; returns the fresh settings. */
export const resubscribeToSpace = async (spaceId: string): Promise<NotificationSettings> => {
  const response = await makeAuthenticatedRequest(
    `/users/me/notification-settings/space-opt-outs/${encodeURIComponent(spaceId)}`,
    { method: 'DELETE' },
  );
  if (!response?.ok) throw new Error('Failed to re-subscribe');
  return response.json();
};

export const getNotificationSettings = async (): Promise<NotificationSettings | null> => {
  const response = await makeAuthenticatedRequest('/users/me/notification-settings');
  if (!response?.ok) return null;
  return response.json();
};

export const updateNotificationSettings = async (
  data: Partial<NotificationSettings>,
): Promise<NotificationSettings> => {
  const response = await makeAuthenticatedRequest('/users/me/notification-settings', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

  if (!response?.ok) throw await errorFrom(response, 'Failed to update notification settings');
  return response.json();
};
