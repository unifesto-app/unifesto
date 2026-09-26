import { makePublicRequest } from './helpers';

/** Version policy for one platform, as returned by GET /app/version. */
export interface PlatformVersionInfo {
  latestVersion: string;
  minimumVersion: string;
  storeUrl: string;
}

export interface AppVersionInfo {
  ios: PlatformVersionInfo;
  android: PlatformVersionInfo;
}

/**
 * Fetch the backend's version policy. Returns null on any failure so an update
 * check never blocks or crashes app startup.
 */
export async function getAppVersion(): Promise<AppVersionInfo | null> {
  const response = await makePublicRequest('/app/version');
  if (!response?.ok) return null;
  try {
    return (await response.json()) as AppVersionInfo;
  } catch {
    return null;
  }
}
