/**
 * Current-user API — resolves the signed-in profile and their Apex surface.
 *
 * The backend returns a profile from `GET /users/me` with a `roles` array
 * (`[{ role: { code, name } }]`) and space memberships from
 * `GET /users/me/spaces`. We normalize both into a single `CurrentUser`.
 */

import backendClient, { apiCall, ApiError } from "./backend-client";
import {
  CurrentUser,
  SpaceWithHierarchy,
  isAdminRole,
} from "@/lib/types/rbac";

interface RawProfile {
  id: string;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  mobileNumber: string;
  roles?: { role: { code: string; name: string } }[];
}

/**
 * Fetch the current user, folding platform roles + space memberships into a
 * single `CurrentUser`. `role` is set to the first admin-granting role code
 * when present (so `resolveAppRole` can route to the admin surface).
 */
export async function getCurrentUser(): Promise<{
  data: CurrentUser | null;
  error: ApiError | null;
}> {
  const { data: profile, error } = await apiCall<RawProfile>(
    backendClient.get("/users/me")
  );
  if (error || !profile) return { data: null, error };

  const roleCodes = (profile.roles ?? []).map((r) => r.role.code);
  const adminCode = roleCodes.find((code) => isAdminRole(code)) ?? null;

  const { data: spaces } = await apiCall<SpaceWithHierarchy[]>(
    backendClient.get("/users/me/spaces")
  );

  const user: CurrentUser = {
    id: profile.id,
    name: profile.fullName ?? profile.username ?? "Unifesto user",
    email: profile.mobileNumber,
    username: profile.username,
    avatar_url: profile.avatarUrl,
    role: adminCode,
    spaces: spaces ?? [],
  };

  return { data: user, error: null };
}
