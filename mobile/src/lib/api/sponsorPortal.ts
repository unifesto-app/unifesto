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
  note: string | null;
  createdAt: string;
  eventSponsorId: string;
  eventId: string;
  eventTitle: string;
}

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

/** Scan an attendee's ticket QR at the booth. Scanning is the attendee's consent. */
export const boothScan = (sponsorId: string, eventSponsorId: string, qrCode: string) =>
  call<BoothScanResult>(`/sponsor-portal/sponsors/${sponsorId}/scan`, {
    method: 'POST',
    body: JSON.stringify({ eventSponsorId, qrCode }),
    retry: true, // upserted server-side, so a repeat scan is safe
  });
