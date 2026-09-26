/**
 * IAM for Spaces — per-space capability overrides. Backed by the NestJS
 * `/iam/space/:spaceId/*` endpoints, gated by `space:manage-members` (Space
 * Admin only). Lets a Space Admin tune what their event roles (Curator /
 * Co-Curator / Crew) may do within THIS space, on top of the platform defaults.
 *
 * Two things stay off-limits by platform policy and are surfaced as locked:
 *   - `event:manage-money` — platform-controlled (separation of duty);
 *   - `event:view`        — mandatory for any event role.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export type RoleScope = "PLATFORM" | "SPACE" | "EVENT";

export interface SpaceMatrixAction {
  key: string;
  scope: RoleScope;
  /** false ⇒ shown but not toggleable. */
  editable: boolean;
  /** Why it is locked, so the UI can explain it. */
  locked?: "money" | "view";
}

export interface SpaceMatrixRole {
  code: string;
  /** true when this space overrides this role (vs inheriting the platform default). */
  customized: boolean;
  grants: string[];
}

export interface SpaceCapabilityMatrix {
  spaceId: string;
  actions: SpaceMatrixAction[];
  roles: SpaceMatrixRole[];
}

type Result<T> = { data: T | null; error: ApiError | null };

/** `GET /iam/space/:spaceId/matrix`. */
export async function getSpaceCapabilityMatrix(
  spaceId: string
): Promise<Result<SpaceCapabilityMatrix>> {
  return apiCall<SpaceCapabilityMatrix>(
    backendClient.get(`/iam/space/${spaceId}/matrix`)
  );
}

/** `PATCH /iam/space/:spaceId/matrix` — toggle one (role, action) in this space. */
export async function setSpaceCapabilityGrant(
  spaceId: string,
  input: { code: string; action: string; granted: boolean }
): Promise<Result<SpaceCapabilityMatrix>> {
  return apiCall<SpaceCapabilityMatrix>(
    backendClient.patch(`/iam/space/${spaceId}/matrix`, input)
  );
}

/** `DELETE /iam/space/:spaceId/role/:code` — reset a role to the platform default. */
export async function resetSpaceCapabilityRole(
  spaceId: string,
  code: string
): Promise<Result<SpaceCapabilityMatrix>> {
  return apiCall<SpaceCapabilityMatrix>(
    backendClient.delete(`/iam/space/${spaceId}/role/${code}`)
  );
}

export const ACTION_LABELS: Record<string, string> = {
  "event:view": "View event",
  "event:edit": "Edit event",
  "event:publish": "Publish / unpublish",
  "event:cancel": "Cancel event",
  "event:manage-money": "Event money",
  "event:assign-crew": "Assign crew",
  "event:manage-attendees": "Manage attendees",
  "event:check-in": "Check-in / scan",
};

export const ROLE_LABELS: Record<string, string> = {
  CURATOR: "Curator",
  CO_CURATOR: "Co-Curator",
  CREW: "Crew",
};

export function actionLabel(key: string): string {
  return ACTION_LABELS[key] ?? key;
}

export function roleLabel(code: string): string {
  return ROLE_LABELS[code] ?? code;
}
