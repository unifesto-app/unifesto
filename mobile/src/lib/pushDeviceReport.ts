import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeAuthenticatedRequest } from './api/helpers';
import PushService from '../services/PushService';

/**
 * Links this install to the signed-in user on the backend: reports its native
 * push token (APNs on iOS, FCM on Android) via PUT /users/me/push-devices, and
 * the backend sends to it directly (C12). Per-user pushes (registration,
 * reminders) reach this device from then on.
 */

const LAST_REPORTED_KEY = 'unifesto_last_reported_push_device';

/** What we cache locally after a successful report. */
interface LastReport {
  userId: string;
  token: string;
  optedIn: boolean;
  /** ISO timestamp of when we last reported. */
  at: string;
  /**
   * This install's OneSignal subscription from 5.0.0 and older, kept until the
   * backend confirms it deleted it (so the phone never gets a push twice).
   */
  replaces?: string;
}

interface CurrentDevice {
  userId: string;
  token: string;
  optedIn: boolean;
}

/** Re-report an unchanged device after this long so `lastSeenAt` stays fresh. */
const REPORT_STALE_MS = 24 * 60 * 60 * 1000;

/**
 * Runs on every session start and every PushService change. Report when
 * anything identifying changed (user, token, opt-in) or an old OneSignal
 * subscription still needs replacing; otherwise refresh once a day, like
 * appVersionReport. A bad timestamp counts as stale.
 */
function shouldReport(current: CurrentDevice, last: LastReport | null): boolean {
  if (!last || last.replaces) return true;
  if (last.userId !== current.userId) return true;
  if (last.token !== current.token) return true;
  if (last.optedIn !== current.optedIn) return true;
  const lastAt = Date.parse(last.at);
  return Number.isNaN(lastAt) || Date.now() - lastAt >= REPORT_STALE_MS;
}

/** The cached report. A 5.0.0 OneSignal one becomes "replace this subscription". */
async function readLastReport(): Promise<LastReport | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_REPORTED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastReport> & { subscriptionId?: string };
    if (parsed?.token && parsed.userId) return parsed as LastReport;
    if (parsed?.subscriptionId && parsed.userId) {
      return { userId: parsed.userId, token: '', optedIn: !!parsed.optedIn, at: '', replaces: parsed.subscriptionId };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Report this device for `userId` if the gate allows it. Best-effort: never
 * throws. No-op off iOS/Android or when the OS gives no token; PushService's
 * change listener calls this again later.
 */
export async function syncPushDevice(userId: string): Promise<void> {
  try {
    const identity = await PushService.getDeviceIdentity();
    if (!identity) return;

    const current: CurrentDevice = { userId, token: identity.token, optedIn: identity.optedIn };
    const last = await readLastReport();
    if (!shouldReport(current, last)) return;

    const response = await makeAuthenticatedRequest('/users/me/push-devices', {
      method: 'PUT',
      body: JSON.stringify({
        token: identity.token,
        platform: Platform.OS,
        apnsEnv: identity.apnsEnv ?? undefined,
        replacesSubscriptionId: last?.replaces,
        deviceModel: Device.modelName ?? undefined,
        appVersion: Application.nativeApplicationVersion ?? undefined,
        optedIn: identity.optedIn,
      }),
    });

    if (response?.ok) {
      // Only cache once the server accepted it, so a failure retries next time.
      const { replaced } = ((await response.json().catch(() => ({}))) ?? {}) as { replaced?: boolean };
      const record: LastReport = {
        ...current,
        at: new Date().toISOString(),
        ...(last?.replaces && replaced === false ? { replaces: last.replaces } : {}),
      };
      await AsyncStorage.setItem(LAST_REPORTED_KEY, JSON.stringify(record)).catch(() => {});
    }
  } catch (error) {
    if (__DEV__) console.warn('[pushDeviceReport] skipped:', error);
  }
}

/**
 * Detach this device from the user on sign-out. Must run BEFORE the auth token
 * is cleared (the DELETE is authenticated). Best-effort: never throws.
 */
export async function unregisterPushDevice(): Promise<void> {
  try {
    const last = await readLastReport();
    await AsyncStorage.removeItem(LAST_REPORTED_KEY).catch(() => {});
    const id = last?.token || last?.replaces;
    if (!id) return;
    await makeAuthenticatedRequest(`/users/me/push-devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch {
    // Non-fatal: sign-out must never be blocked by this.
  }
}
