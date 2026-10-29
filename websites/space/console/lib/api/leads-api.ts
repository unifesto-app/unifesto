/**
 * Leads API — the organiser's own interest/inquiry funnel (P4), over the NestJS
 * `/spaces/:spaceId/leads/*` routes, gated by `space:manage-sponsors`. Distinct
 * from sponsor leads (attendee→sponsor); these are people who signalled interest
 * ("Notify me", a space inquiry) or were added by hand.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type LeadStatus = "NEW" | "CONTACTED" | "CONVERTED" | "ARCHIVED";
export type LeadSource = "EVENT_INTEREST" | "SPACE_INQUIRY" | "MANUAL" | "IMPORT";

export interface Lead {
  id: string;
  spaceId: string;
  eventId: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  source: LeadSource;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
  event?: { id: string; title: string } | null;
}

export interface CreateLeadPayload {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  eventId?: string;
}

export interface UpdateLeadPayload {
  status?: LeadStatus;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
}

const base = (spaceId: string) => `/spaces/${spaceId}/leads`;
type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

export function listLeads(
  spaceId: string,
  filters?: { status?: LeadStatus; source?: LeadSource; eventId?: string }
): Result<Lead[]> {
  return apiCall<Lead[]>(backendClient.get(base(spaceId), { params: filters }));
}

export function createLead(spaceId: string, payload: CreateLeadPayload): Result<Lead> {
  return apiCall<Lead>(backendClient.post(base(spaceId), payload));
}

export function updateLead(
  spaceId: string,
  id: string,
  payload: UpdateLeadPayload
): Result<Lead> {
  return apiCall<Lead>(backendClient.patch(`${base(spaceId)}/${id}`, payload));
}

export function deleteLead(spaceId: string, id: string): Result<{ deleted: boolean }> {
  return apiCall(backendClient.delete(`${base(spaceId)}/${id}`));
}
