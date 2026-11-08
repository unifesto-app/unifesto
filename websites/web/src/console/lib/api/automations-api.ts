/**
 * An event's automatic messages (C18): the ones its managers can switch off
 * for this event alone, over `/events/:eventId/automations` (event:edit).
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export interface EventAutomation {
  key: string;
  name: string;
  when: string;
  channels: Array<"push" | "inapp" | "email" | "whatsapp">;
  on: boolean;
}

export function getEventAutomations(eventId: string): Promise<{ data: EventAutomation[] | null; error: ApiError | null }> {
  return apiCall(backendClient.get(`/events/${eventId}/automations`));
}

export function setEventAutomation(
  eventId: string,
  key: string,
  on: boolean
): Promise<{ data: EventAutomation[] | null; error: ApiError | null }> {
  return apiCall(backendClient.patch(`/events/${eventId}/automations`, { key, on }));
}
