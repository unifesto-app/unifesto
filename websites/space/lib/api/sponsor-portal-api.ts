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
  note: string | null;
  createdAt: string;
  eventSponsorId: string;
  eventId: string;
  eventTitle: string;
}

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

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
    })
  );
}
