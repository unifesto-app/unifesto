/**
 * Admin API request logs — a trail of every call handled by the Unifesto
 * backend (api.unifesto.app). Backed by the NestJS `/admin/logs` controller.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type LogStatusFilter =
  | "success"
  | "client_error"
  | "server_error"
  | "error";

export interface ApiLog {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface LogsResponse {
  logs: ApiLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface LogStats {
  total: number;
  last24h: number;
  errors24h: number;
  avgDurationMs: number;
}

export interface ListLogsParams {
  method?: string;
  status?: LogStatusFilter;
  search?: string;
  userId?: string;
  page?: number;
  limit?: number;
}

type Result<T> = { data: T | null; error: ApiError | null };

/** `GET /admin/logs` — paginated, filterable request log. */
export async function getLogs(
  params: ListLogsParams = {}
): Promise<Result<LogsResponse>> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return apiCall<LogsResponse>(
    backendClient.get(`/admin/logs${qs ? `?${qs}` : ""}`)
  );
}

/** `GET /admin/logs/stats` — 24h summary. */
export async function getLogStats(): Promise<Result<LogStats>> {
  return apiCall<LogStats>(backendClient.get("/admin/logs/stats"));
}

/** Badge tone for an HTTP status code. */
export function statusTone(
  code: number
): "success" | "warning" | "destructive" | "neutral" {
  if (code >= 500) return "destructive";
  if (code >= 400) return "warning";
  if (code >= 200 && code < 400) return "success";
  return "neutral";
}
