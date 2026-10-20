/**
 * IAM — the platform capability matrix. Backed by the NestJS `/iam` endpoints,
 * gated by `platform:manage` (Platform Admin only). Lets an admin see and edit
 * which roles grant which actions; ADMIN itself is shown but locked because its
 * power is an inheritance rule, not a matrix grant.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

/** Scope an action / role lives at (mirrors the backend RoleScope enum). */
export type RoleScope = "PLATFORM" | "SPACE" | "EVENT";

/** One action in the catalogue. `key` is e.g. "space:manage-billing". */
export interface MatrixAction {
  key: string;
  scope: RoleScope;
}

/** One role row: the actions it currently grants, plus edit metadata. */
export interface MatrixRole {
  code: string;
  scope: RoleScope;
  editable: boolean;
  note?: string;
  grants: string[];
}

export interface CapabilityMatrix {
  actions: MatrixAction[];
  roles: MatrixRole[];
}

type Result<T> = { data: T | null; error: ApiError | null };

/** `GET /iam/matrix`. */
export async function getCapabilityMatrix(): Promise<Result<CapabilityMatrix>> {
  return apiCall<CapabilityMatrix>(backendClient.get("/iam/matrix"));
}

/**
 * `PATCH /iam/matrix` — toggle one (role, action) grant. Returns the whole
 * refreshed matrix so the caller can replace state without a second fetch.
 */
export async function setCapabilityGrant(input: {
  code: string;
  action: string;
  granted: boolean;
}): Promise<Result<CapabilityMatrix>> {
  return apiCall<CapabilityMatrix>(backendClient.patch("/iam/matrix", input));
}

/** Human labels for actions — the backend sends only keys. */
export const ACTION_LABELS: Record<string, string> = {
  "platform:manage": "Manage platform",
  "company:view": "View company",
  "company:edit": "Edit own company items",
  "company:manage": "Manage company",
  "company:view-restricted": "Restricted company items",
  "product:view": "View product board",
  "product:edit": "Edit product board",
  "space:view": "View space",
  "space:manage-billing": "Billing & plan",
  "space:manage-members": "Manage members",
  "space:manage-money": "Money (payouts/refunds)",
  "space:manage-settings": "Settings",
  "space:create-event": "Create events",
  "event:view": "View event",
  "event:edit": "Edit event",
  "event:publish": "Publish / unpublish",
  "event:cancel": "Cancel event",
  "event:manage-money": "Event money",
  "event:assign-crew": "Assign crew",
  "event:manage-attendees": "Manage attendees",
  "event:check-in": "Check-in / scan",
};

/** Human labels for role codes. */
export const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Platform Admin",
  EMPLOYEE: "Employee",
  SPACE_ADMIN: "Space Admin",
  CURATOR: "Curator",
  CO_CURATOR: "Co-Curator",
  CREW: "Crew",
};

export const SCOPE_LABELS: Record<RoleScope, string> = {
  PLATFORM: "Platform",
  SPACE: "Space",
  EVENT: "Event",
};

export function actionLabel(key: string): string {
  return ACTION_LABELS[key] ?? key;
}

export function roleLabel(code: string): string {
  return ROLE_LABELS[code] ?? code;
}
