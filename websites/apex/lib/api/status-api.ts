/**
 * Platform status — public-status-page style. Backed by the NestJS
 * `/admin/status` endpoints: 90-day uptime history per service (sampled every
 * 5 minutes) plus incidents.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type ServiceCurrent = "up" | "down" | "unknown";
export type DayStatus = "up" | "down" | "partial" | "nodata";
export type IncidentStatus =
  | "INVESTIGATING"
  | "IDENTIFIED"
  | "MONITORING"
  | "RESOLVED";
export type IncidentImpact = "NONE" | "MINOR" | "MAJOR" | "CRITICAL";

export interface DayBucket {
  date: string; // YYYY-MM-DD
  status: DayStatus;
  uptime: number | null;
}

export interface StatusServiceEntry {
  key: string;
  name: string;
  currentStatus: ServiceCurrent;
  latencyMs: number | null;
  uptimePercent: number | null;
  days: DayBucket[];
}

export interface Incident {
  id: string;
  title: string;
  body: string | null;
  status: IncidentStatus;
  impact: IncidentImpact;
  affectedServices: string[];
  startedAt: string;
  resolvedAt: string | null;
  /** null = opened automatically by the health sampler. */
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type OverallStatus =
  | "operational"
  | "degraded"
  | "major_outage"
  | "unknown";

export interface StatusSummary {
  /** Worse of live health and unresolved incidents; "unknown" when sampling stopped. */
  overall: OverallStatus;
  /** No health sample for 15+ min: per-service states are unknown, not green. */
  stale: boolean;
  lastSampleAt: string | null;
  updatedAt: string;
  services: StatusServiceEntry[];
  incidents: Incident[];
}

type Result<T> = { data: T | null; error: ApiError | null };

/** `GET /admin/status` — uptime bars + incidents. */
export async function getStatusSummary(): Promise<Result<StatusSummary>> {
  return apiCall<StatusSummary>(backendClient.get("/admin/status"));
}

/** `GET /admin/status/incidents`. */
export async function listIncidents(): Promise<Result<Incident[]>> {
  return apiCall<Incident[]>(backendClient.get("/admin/status/incidents"));
}

export interface CreateIncidentInput {
  title: string;
  body?: string;
  impact?: IncidentImpact;
  status?: IncidentStatus;
  affectedServices?: string[];
}

/** `POST /admin/status/incidents`. */
export async function createIncident(
  input: CreateIncidentInput
): Promise<Result<Incident>> {
  return apiCall<Incident>(
    backendClient.post("/admin/status/incidents", input)
  );
}

/** `PATCH /admin/status/incidents/:id`. */
export async function updateIncident(
  id: string,
  input: Partial<CreateIncidentInput>
): Promise<Result<Incident>> {
  return apiCall<Incident>(
    backendClient.patch(`/admin/status/incidents/${id}`, input)
  );
}

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  INVESTIGATING: "Investigating",
  IDENTIFIED: "Identified",
  MONITORING: "Monitoring",
  RESOLVED: "Resolved",
};

export const INCIDENT_IMPACT_LABEL: Record<IncidentImpact, string> = {
  NONE: "Maintenance",
  MINOR: "Minor",
  MAJOR: "Major",
  CRITICAL: "Critical",
};
