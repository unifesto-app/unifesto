/**
 * White-label admin API. Spaces brand themselves in the Space app's Branding
 * studio; Apex keeps only the platform kill switch (H15 retired the request
 * inbox and Apply branding).
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

/**
 * `PATCH /white-label/admin/spaces/:spaceId/suspend` — platform kill switch.
 * Suspended branding stops rendering everywhere; the stored theme is kept.
 */
export async function setSpaceBrandingSuspended(
  spaceId: string,
  suspended: boolean
): Promise<{ data: { brandingSuspendedAt: string | null } | null; error: ApiError | null }> {
  return apiCall<{ brandingSuspendedAt: string | null }>(
    backendClient.patch(`/white-label/admin/spaces/${spaceId}/suspend`, { suspended })
  );
}
