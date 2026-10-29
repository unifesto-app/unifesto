/**
 * Sponsor portal API (P5) — over `/sponsor-portal/*`. Any signed-in user can
 * call these; the backend scopes every response to the sponsors they belong to
 * (SponsorUser). `getMyPortal()` doubles as the access probe the /sponsor
 * surface gates on: an empty list means "not a sponsor".
 */

import backendClient, { apiCall, ApiError } from "./backend-client";
import type { SponsorLeadSource } from "./sponsors-api";

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

export type PortalLeadStatus = "NEW" | "CONTACTED" | "CONVERTED" | "ARCHIVED";

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

/** My follow-up on a lead (E3): status and/or note. */
export function updatePortalLead(
  sponsorId: string,
  leadId: string,
  patch: { status?: PortalLeadStatus; note?: string | null }
): Result<{ id: string; status: PortalLeadStatus; note: string | null }> {
  return apiCall(backendClient.patch(`/sponsor-portal/sponsors/${sponsorId}/leads/${leadId}`, patch));
}

export function getMyPortal(): Result<PortalSponsor[]> {
  return apiCall<PortalSponsor[]>(backendClient.get(`/sponsor-portal/me`));
}

export function getPortalLeads(sponsorId: string): Result<PortalLead[]> {
  return apiCall<PortalLead[]>(
    backendClient.get(`/sponsor-portal/sponsors/${sponsorId}/leads`)
  );
}

export interface ScanResult {
  captured: boolean;
  lead: { id: string; name: string | null; email: string | null };
}

export function boothScan(
  sponsorId: string,
  eventSponsorId: string,
  qrCode: string
): Result<ScanResult> {
  return apiCall<ScanResult>(
    backendClient.post(`/sponsor-portal/sponsors/${sponsorId}/scan`, {
      eventSponsorId,
      qrCode,
      // The caller only gets here after the attendee agreed (the consent box).
      attendeeConsent: true,
    })
  );
}
