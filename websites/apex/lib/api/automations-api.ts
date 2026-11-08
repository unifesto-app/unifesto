/**
 * Automations API (C18): every automatic message Unifesto sends, with its
 * channels and what it sent per channel, over `/admin/automations` (ADMIN).
 * Optional ones can be switched off for one event at `/events/:id/automations`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

export type AutomationChannel = "push" | "inapp" | "email" | "whatsapp";

export interface Automation {
  key: string;
  name: string;
  when: string;
  to: string;
  group: string;
  channels: AutomationChannel[];
  kinds: string[];
  /** event: an event's managers can switch it off; feedback: the event's feedback switch. */
  switchable?: "event" | "feedback";
  /** message_deliveries rows by status, per channel that logs them. */
  counts: Partial<Record<AutomationChannel, Record<string, number>>>;
}

export function listAutomations(days = 30): Result<{ days: number; automations: Automation[] }> {
  return apiCall(backendClient.get("/admin/automations", { params: { days } }));
}

export interface EventAutomation {
  key: string;
  name: string;
  when: string;
  channels: AutomationChannel[];
  on: boolean;
}

export function getEventAutomations(eventId: string): Result<EventAutomation[]> {
  return apiCall(backendClient.get(`/events/${eventId}/automations`));
}

export function setEventAutomation(eventId: string, key: string, on: boolean): Result<EventAutomation[]> {
  return apiCall(backendClient.patch(`/events/${eventId}/automations`, { key, on }));
}
