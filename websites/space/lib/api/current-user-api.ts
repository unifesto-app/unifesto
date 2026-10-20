/**
 * Current-user API — resolves the signed-in profile and their space surface.
 *
 * The backend returns a profile from `GET /users/me` (with a `roles` array of
 * platform/space role assignments) and space memberships from
 * `GET /users/me/spaces`. We fold both into the single `CurrentUser` shape the
 * space app reasons about (see lib/types/rbac.ts).
 */

import backendClient, { apiCall, ApiError } from "./backend-client";
import { CurrentUser, SpaceMembership, isPlatformStaff } from "@/lib/types/rbac";

interface RawProfile {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  mobileNumber: string;
  roles?: { role: { code: string; name: string } }[];
}

/**
 * Fetch the current user, folding their platform role (if any) and space
 * memberships into a single `CurrentUser`. `platformRole` carries the first
 * platform-staff code (ADMIN or EMPLOYEE) present so the landing gate can route platform
 * staff to Apex; space access is decided entirely by `spaces[].userRole`.
 */
export async function getCurrentUser(): Promise<{
  data: CurrentUser | null;
  error: ApiError | null;
}> {
  const { data: profile, error } = await apiCall<RawProfile>(
    backendClient.get("/users/me")
  );
  if (error || !profile) return { data: null, error };

  const platformRole =
    (profile.roles ?? [])
      .map((r) => r.role.code)
      .find((code) => isPlatformStaff({ platformRole: code } as CurrentUser)) ??
    null;

  // `includeEventRoles=true` also surfaces spaces the user reaches only through
  // an event-scoped role (curator/co-curator/crew added to an event), so they
  // can sign in and reach their event(s). See rbac `isEventScopedSpace`.
  const { data: spaces } = await apiCall<SpaceMembership[]>(
    backendClient.get("/users/me/spaces?includeEventRoles=true")
  );

  const user: CurrentUser = {
    id: profile.id,
    name: profile.fullName ?? profile.username ?? "Unifesto user",
    email: profile.mobileNumber,
    username: profile.username,
    avatar_url: profile.avatarUrl,
    platformRole,
    spaces: spaces ?? [],
  };

  return { data: user, error: null };
}
