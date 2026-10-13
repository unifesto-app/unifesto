import { Platform } from 'react-native';
import * as Application from 'expo-application';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeAuthenticatedRequest } from './api/helpers';
import { buildInfo } from './appBuild';

/**
 * Reports the installed build to the backend so staff can see, per account,
 * which app version each user is running (surfaced in Apex → Users). This is
 * the client half of that feature; the backend persists it on the user row via
 * PATCH /users/me/app-version.
 *
 * It also sends the EAS runtime and the running OTA update id (null = the
 * store build's own code), so Apex › OTA updates can show how many active
 * users each runtime and update reached.
 *
 * Separate from `appUpdate.ts`, which *reads* the version policy to prompt for
 * updates — this module *writes* the current client's version.
 */

const LAST_REPORTED_KEY = 'unifesto_last_reported_app_version';

/** Fire the report to the backend. Best-effort: never throws. */
async function sendReport(
  version: string,
  platform: string,
  runtimeVersion: string | null,
  updateId: string | null,
): Promise<boolean> {
  try {
    const patch = (body: object) =>
      makeAuthenticatedRequest('/users/me/app-version', { method: 'PATCH', body: JSON.stringify(body) });
    // runtimeVersion is null in dev / with expo-updates disabled: omit both then.
    let response = await patch(runtimeVersion ? { version, platform, runtimeVersion, updateId } : { version, platform });
    // A backend from before the runtime fields rejects unknown properties (400): still report the version.
    if (response?.status === 400 && runtimeVersion) response = await patch({ version, platform });
    return Boolean(response?.ok);
  } catch {
    return false;
  }
}

/**
 * Whether to hit the network this launch.
 *
 * Context:`maybeReportAppVersion()` runs every time a session becomes active
 * (app open, login, token refresh). Reporting on *every* call means a DB write
 * per launch per user. Gating avoids that — but the gate defines what the
 * admin's "last reported at" timestamp actually means.
 *
 * Chosen policy: report on any version or OTA update change, and otherwise at most once per
 * `REPORT_STALE_MS` (24h). This keeps `appVersionLastReportedAt` honest as a
 * "last seen" signal for the admin view while capping writes to ~1/user/day.
 */
const REPORT_STALE_MS = 24 * 60 * 60 * 1000;

/** What we cache locally after a successful report. */
interface LastReport {
  /** Who we reported for — the cache is per device, but the row is per user. */
  userId: string;
  version: string;
  /** Running OTA update (null = build code). Missing on caches from older versions. */
  updateId?: string | null;
  /** ISO timestamp of when we last reported. */
  at: string;
}

function shouldReport(
  userId: string,
  installedVersion: string,
  updateId: string | null,
  lastReported: LastReport | null,
): boolean {
  // Never reported on this device → report.
  if (!lastReported) return true;
  // A different account signed in on this device → its row has never been
  // stamped, so report even if the version and 24h window say otherwise.
  if (lastReported.userId !== userId) return true;
  // Version changed since we last reported → report immediately.
  if (lastReported.version !== installedVersion) return true;
  // A new OTA update (or a rollback) started running → report so adoption is current.
  if ((lastReported.updateId ?? null) !== updateId) return true;
  // Same version, but our last report is stale → refresh so "last seen" tracks
  // recency. A malformed/missing timestamp is treated as stale.
  const lastAt = Date.parse(lastReported.at);
  if (Number.isNaN(lastAt)) return true;
  return Date.now() - lastAt >= REPORT_STALE_MS;
}

/** Read + parse the cached report, tolerating missing/corrupt values. */
async function readLastReport(): Promise<LastReport | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_REPORTED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastReport;
    // Caches written before userId existed are treated as missing (one extra report).
    return parsed?.version && parsed?.userId ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Report the installed app version if the gate allows it. Call once whenever a
 * session becomes active. Silent no-op on web / when the version can't be read.
 */
export async function maybeReportAppVersion(userId: string): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  const installedVersion = Application.nativeApplicationVersion;
  if (!installedVersion) return;

  // Sign-in and a foreground resume can fire together; one report is enough.
  if (inFlight) return;
  inFlight = true;
  try {
    const { runtimeVersion, updateId } = buildInfo();
    const lastReported = await readLastReport();

    if (!shouldReport(userId, installedVersion, updateId, lastReported)) return;

    const ok = await sendReport(installedVersion, Platform.OS, runtimeVersion, updateId);
    if (ok) {
      // Only remember the report once the server has accepted it, so a failed
      // report is retried on the next launch instead of being silently dropped.
      const record: LastReport = {
        userId,
        version: installedVersion,
        updateId,
        at: new Date().toISOString(),
      };
      await AsyncStorage.setItem(
        LAST_REPORTED_KEY,
        JSON.stringify(record),
      ).catch(() => {});
    }
  } catch (error) {
    // Best-effort telemetry — a bad gate or storage failure must never bubble
    // into the auth flow that calls this.
    if (__DEV__) console.warn('[appVersionReport] skipped:', error);
  } finally {
    inFlight = false;
  }
}

let inFlight = false;
