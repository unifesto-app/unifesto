import { call } from './manageEvent';
import type { SponsorLeadSource } from './spaceSponsors';

/*
 * Sponsor side (the "portal"), over `/sponsor-portal/*`. Any signed-in user may
 * call it; the backend scopes everything to the sponsors they were invited to
 * (SponsorUser), not the space role matrix. An empty `getMySponsorships()` list
 * means "not a sponsor". Mirrors websites/space/lib/api/sponsor-portal-api.ts.
 */

export interface PortalEvent {
  eventSponsorId: string;
  eventId: string;
  title: string;
  slug: string;
  startDateTime: string;
  leadCaptureEnabled: boolean;
  leadCount: number;
}

export interface PortalSponsor {
  sponsorId: string;
  name: string;
  logoUrl: string | null;
  spaceName: string;
  leadCount: number;
  events: PortalEvent[];
}

export interface PortalLead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: SponsorLeadSource;
  status: PortalLeadStatus;
  note: string | null;
  createdAt: string;
  eventSponsorId: string;
  eventId: string;
  eventTitle: string;
}

export type PortalLeadStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'ARCHIVED';

/** My follow-up on one of my leads (E3). */
export const updatePortalLead = (sponsorId: string, leadId: string, patch: { status?: PortalLeadStatus; note?: string | null }) =>
  call<{ id: string; status: PortalLeadStatus; note: string | null }>(`/sponsor-portal/sponsors/${sponsorId}/leads/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });

export interface BoothScanResult {
  /** false = this attendee was already a lead for this sponsor at this event. */
  captured: boolean;
  lead: { id: string; name: string | null; email: string | null };
}

/** Sponsors I can act for. Never throws: a failure reads as "none". */
export async function getMySponsorships(): Promise<PortalSponsor[]> {
  const res = await call<PortalSponsor[]>('/sponsor-portal/me');
  return res.ok && Array.isArray(res.data) ? res.data : [];
}

export const getPortalLeads = (sponsorId: string) => call<PortalLead[]>(`/sponsor-portal/sponsors/${sponsorId}/leads`);

/** Scan an attendee's ticket QR at the booth, once they said yes on the prompt. */
export const boothScan = (sponsorId: string, eventSponsorId: string, qrCode: string) =>
  call<BoothScanResult>(`/sponsor-portal/sponsors/${sponsorId}/scan`, {
    method: 'POST',
    body: JSON.stringify({ eventSponsorId, qrCode, attendeeConsent: true }),
    retry: true, // upserted server-side, so a repeat scan is safe
  });
