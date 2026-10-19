import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { API_URL } from '../constants';

/**
 * App-wide online/offline signal, inferred from real traffic instead of a
 * native NetInfo module: any fetch that throws flips us offline, any response
 * (even a 4xx/5xx — the server answered) flips us back. While offline a light
 * probe hits the API root so the app recovers without the user doing anything.
 */

const PROBE_INTERVAL_MS = 8_000;
const PROBE_TIMEOUT_MS = 5_000;

let online = true;
/** Online, but the last answer was an error we covered with a saved copy. */
let servingSaved = false;
let probeTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function setOnline(next: boolean) {
  if (next === online) return;
  online = next;
  if (online) stopProbing();
  else startProbing();
  listeners.forEach((l) => l());
}

export function reportNetworkSuccess(servedSaved = false) {
  if (servedSaved !== servingSaved) {
    servingSaved = servedSaved;
    if (online) listeners.forEach((l) => l());
  }
  setOnline(true);
}

export function reportNetworkFailure() {
  setOnline(false);
}

export function isOnline() {
  return online;
}

/** One reachability check; updates the shared state and returns the result. */
export async function probeConnectivity(): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_URL}/`, { method: 'GET', signal: controller.signal });
    // Health-check semantics match docker-compose: <500 means the API is up.
    const up = res.status < 500;
    setOnline(up);
    return up;
  } catch {
    setOnline(false);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function startProbing() {
  if (probeTimer) return;
  probeTimer = setInterval(() => {
    if (AppState.currentState === 'active') void probeConnectivity();
  }, PROBE_INTERVAL_MS);
}

function stopProbing() {
  if (probeTimer) clearInterval(probeTimer);
  probeTimer = null;
}

// Coming back to the foreground while offline: check right away rather than
// waiting for the next tick.
AppState.addEventListener('change', (state) => {
  if (state === 'active' && !online) void probeConnectivity();
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Re-renders when connectivity flips. */
export function useIsOffline(): boolean {
  return !useSyncExternalStore(subscribe, isOnline, isOnline);
}

export type NetworkNotice = 'offline' | 'saved' | null;
const notice = (): NetworkNotice => (!online ? 'offline' : servingSaved ? 'saved' : null);

/** What the banner says: offline, online but showing saved data (server error), or nothing. */
export function useNetworkNotice(): NetworkNotice {
  return useSyncExternalStore(subscribe, notice, notice);
}

/** Run `fn` each time the app comes back online (e.g. to refetch a screen). */
export function onReconnect(fn: () => void): () => void {
  let prev = online;
  return subscribe(() => {
    if (online && !prev) fn();
    prev = online;
  });
}
