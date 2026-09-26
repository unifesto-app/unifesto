/**
 * Mobile app version policy — backed by the NestJS `/admin/app-version`
 * endpoints. Drives the in-app "update available" prompt: the app compares its
 * installed build against `latestVersion` (optional prompt) and `minimumVersion`
 * (forced update below it).
 */

import backendClient, { apiCall, ApiError } from "./backend-client";

export interface PlatformVersionInfo {
  latestVersion: string;
  minimumVersion: string;
  storeUrl: string;
}

export interface AppVersionConfig {
  ios: PlatformVersionInfo;
  android: PlatformVersionInfo;
}

type Result<T> = { data: T | null; error: ApiError | null };

/** `GET /admin/app-version`. */
export async function getAppVersion(): Promise<Result<AppVersionConfig>> {
  return apiCall<AppVersionConfig>(backendClient.get("/admin/app-version"));
}

/** `PATCH /admin/app-version`. */
export async function updateAppVersion(
  input: AppVersionConfig
): Promise<Result<AppVersionConfig>> {
  return apiCall<AppVersionConfig>(
    backendClient.patch("/admin/app-version", input)
  );
}
