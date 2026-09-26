import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { makeAuthenticatedRequest } from './api/helpers';
import OneSignalService from '../services/OneSignalService';

/**
 * Links this install to the signed-in user on the backend: reports the OneSignal
 * push subscription id (the device id) via PUT /users/me/push-devices. The
 * backend stores user ↔ device and links OneSignal external_id = user.id
 * server-side, so per-user pushes (registration, reminders) reach this
 * device even if the SDK's own login() was missed.
 */

const LAST_REPORTED_KEY = 'unifesto_last_reported_push_device';

/** What we cache locally after a successful report. */
interface LastReport {
  userId: string;
  subscriptionId: string;
  optedIn: boolean;
  /** ISO timestamp of when we last reported. */
  at: string;
}

interface CurrentDevice {
  userId: string;
  subscriptionId: string;
  optedIn: boolean;
}

/**
 * TODO(you): Decide whether this call should hit the network.
 *
 * Runs on every session start AND every OneSignal subscription change (id
 * issued, opt-in toggled). Reporting every time costs one small write per app
 * open; the backend skips the OneSignal link call once a device is linked.
 *
 * Things that MUST trigger a report: a different user on this device, a new
 * subscription id (reinstall / token rotation), opt-in flipping. The open
 * question is the "nothing changed" case: never re-report (fewest writes, but
 * `lastSeenAt` goes stale and a server-side failed link isn't retried until
 * something changes) vs. refresh after some interval (like appVersionReport's
 * 24h) vs. always.
 *
 * Default below = always report (correct, just chattier).
 */
function shouldReport(current: CurrentDevice, last: LastReport | null): boolean {
  return true;
}

/**
 * On first launch (and sometimes on a cold start) OneSignal hands out the
 * subscription id a few seconds after init, and an already-existing id fires no
 * 'change' event. Poll briefly instead of giving up on the first null.
 */
const IDENTITY_RETRY_DELAYS_MS = [2000, 5000, 15000];

async function waitForDeviceIdentity() {
  let identity = await OneSignalService.getDeviceIdentity();
  for (const delay of IDENTITY_RETRY_DELAYS_MS) {
    if (identity) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    identity = await OneSignalService.getDeviceIdentity();
  }
  return identity;
}

async function readLastReport(): Promise<LastReport | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_REPORTED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastReport;
    return parsed?.subscriptionId ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Report this device for `userId` if the gate allows it. Best-effort: never
 * throws. No-op on web, or before OneSignal has issued a subscription id — the
 * subscription-change listener calls this again once it has.
 */
export async function syncPushDevice(userId: string): Promise<void> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  try {
    const identity = await waitForDeviceIdentity();
    if (!identity) return;

    const current: CurrentDevice = {
      userId,
      subscriptionId: identity.subscriptionId,
      optedIn: identity.optedIn,
    };
    if (!shouldReport(current, await readLastReport())) return;

    const response = await makeAuthenticatedRequest('/users/me/push-devices', {
      method: 'PUT',
      body: JSON.stringify({
        subscriptionId: identity.subscriptionId,
        oneSignalId: identity.oneSignalId ?? undefined,
        platform: Platform.OS,
        deviceModel: Device.modelName ?? undefined,
        appVersion: Application.nativeApplicationVersion ?? undefined,
        optedIn: identity.optedIn,
      }),
    });

    if (response?.ok) {
      // Only cache once the server accepted it, so a failure retries next time.
      const record: LastReport = { ...current, at: new Date().toISOString() };
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
    const identity = await OneSignalService.getDeviceIdentity();
    const subscriptionId = identity?.subscriptionId ?? last?.subscriptionId;
    await AsyncStorage.removeItem(LAST_REPORTED_KEY).catch(() => {});
    if (!subscriptionId) return;
    await makeAuthenticatedRequest(
      `/users/me/push-devices/${encodeURIComponent(subscriptionId)}`,
      { method: 'DELETE' },
    );
  } catch {
    // Non-fatal: sign-out must never be blocked by this.
  }
}
