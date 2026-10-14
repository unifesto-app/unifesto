/**
 * Product management API: the plan board (tracks + tasks), activity log and
 * the tokens Claude uses to reach the `/pm/mcp` endpoint. Platform ADMIN only.
 */

import backendClient, { apiCall, ApiError, BACKEND_URL } from "./backend-client";

export const PM_STATUSES = [
  "NEXT",
  "IN_PROGRESS",
  "BLOCKED",
  "PLANNED",
  "DONE",
  "PARKED",
  "DROPPED",
] as const;
export type PmStatus = (typeof PM_STATUSES)[number];

export interface PmTask {
  id: string;
  key: string;
  trackKey: string;
  title: string;
  notes: string | null;
  status: PmStatus;
  owner: string | null;
  dueDate: string | null;
  sortOrder: number;
  updatedAt: string;
}

export interface PmTrack {
  key: string;
  name: string;
  sortOrder: number;
  tasks: PmTask[];
}

export interface PmActivity {
  id: string;
  actor: string;
  message: string;
  createdAt: string;
  task: { key: string } | null;
}

export interface PmToken {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export type PmTaskInput = Partial<Omit<PmTask, "id" | "updatedAt">> & { key: string };

type Result<T> = Promise<{ data: T | null; error: ApiError | null }>;

export const PM_MCP_URL = `${BACKEND_URL}/pm/mcp`;

export const getBoard = (): Result<PmTrack[]> => apiCall(backendClient.get("/pm/board"));
export const getActivity = (take = 100): Result<PmActivity[]> =>
  apiCall(backendClient.get("/pm/activity", { params: { take } }));
export const upsertTask = (input: PmTaskInput): Result<PmTask> =>
  apiCall(backendClient.put("/pm/tasks", input));
export const upsertTrack = (input: { key: string; name: string; sortOrder?: number }): Result<PmTrack> =>
  apiCall(backendClient.put("/pm/tracks", input));
export const getTokens = (): Result<PmToken[]> => apiCall(backendClient.get("/pm/tokens"));
export const createToken = (name: string): Result<{ id: string; name: string; token: string }> =>
  apiCall(backendClient.post("/pm/tokens", { name }));
export const revokeToken = (id: string): Result<{ revoked: boolean }> =>
  apiCall(backendClient.delete(`/pm/tokens/${id}`));
