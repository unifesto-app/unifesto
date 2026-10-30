import { call } from './manageEvent';

/*
 * The organiser's own lead funnel, over `/spaces/:spaceId/leads/*`
 * (space:manage-sponsors). Different from sponsor leads: these are people who
 * tapped "Notify me" on an event, sent an inquiry from the space page, or were
 * added by hand. Mirrors websites/web/src/console/lib/api/leads-api.ts.
 */

export type LeadStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'ARCHIVED';
export type LeadSource = 'EVENT_INTEREST' | 'SPACE_INQUIRY' | 'MANUAL' | 'IMPORT';

export const LEAD_STATUSES: LeadStatus[] = ['NEW', 'CONTACTED', 'CONVERTED', 'ARCHIVED'];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  CONVERTED: 'Converted',
  ARCHIVED: 'Archived',
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  EVENT_INTEREST: 'Notify me',
  SPACE_INQUIRY: 'Space inquiry',
  MANUAL: 'Added by hand',
  IMPORT: 'Imported',
};

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

export interface LeadInput {
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  eventId?: string;
}

const base = (spaceId: string) => `/spaces/${spaceId}/leads`;

export const getLeads = (spaceId: string) => call<Lead[]>(base(spaceId));
export const createLead = (spaceId: string, body: LeadInput) =>
  call<Lead>(base(spaceId), { method: 'POST', body: JSON.stringify(body) });
export const updateLead = (spaceId: string, id: string, body: Partial<LeadInput> & { status?: LeadStatus }) =>
  call<Lead>(`${base(spaceId)}/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
export const deleteLead = (spaceId: string, id: string) => call<unknown>(`${base(spaceId)}/${id}`, { method: 'DELETE' });

/** Display name for a lead with whatever it has. */
export const leadName = (l: Pick<Lead, 'name' | 'email' | 'phone'>) => l.name || l.email || l.phone || 'Unnamed lead';
