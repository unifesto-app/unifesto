import { makeAuthenticatedRequest } from './helpers';

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
}

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

  if (!response?.ok) {
    const error = await response?.json();
    throw new Error(error?.message || 'Failed to update notification settings');
  }
  return response.json();
};
