import { AppState, AppStateStatus } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Over-the-air (EAS Update) JS updates. The native side already checks once on
 * cold start (app.config.js `updates`, applied on the NEXT launch). This adds a
 * check when the app returns to the foreground, because operators keep the app
 * open for days on event days and would otherwise never pick up a fix.
 *
 * Store-version gating (forced/optional store updates) is separate: appUpdate.ts.
 */

/** Don't hit the update server more than once per this window. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;
/** Background time after which a downloaded update is applied without asking. */
const SILENT_RELOAD_AFTER_MS = 30 * 60 * 1000;

let lastCheckAt = 0;
let backgroundedAt: number | null = null;
let checking = false;

function reloadNow() {
  Updates.reloadAsync().catch(() => {});
}

/**
 * Decide what to do once an update has finished downloading while the app is
 * running (policy D1 in docs/version-4.md). Doing nothing is valid: expo-updates
 * applies it on the next cold start.
 *
 * @param backgroundedMs how long the app was in the background before this
 *   foreground check (0 when unknown).
 */
function handleDownloadedUpdate(backgroundedMs: number): void {
  // Away long enough that nobody is mid-task (checkout, door scanning):
  // swap in the new JS silently. Otherwise leave it for the next cold start.
  if (backgroundedMs >= SILENT_RELOAD_AFTER_MS) reloadNow();
}

async function checkAndFetch(backgroundedMs: number) {
  if (__DEV__ || !Updates.isEnabled || checking) return;
  if (Date.now() - lastCheckAt < CHECK_INTERVAL_MS) return;

  checking = true;
  lastCheckAt = Date.now();
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    const result = await Updates.fetchUpdateAsync();
    if (result.isNew) handleDownloadedUpdate(backgroundedMs);
  } catch {
    // Offline or update server unreachable: try again on the next foreground.
  } finally {
    checking = false;
  }
}

/** Start foreground checks. Returns an unsubscribe for effect cleanup. */
export function startOtaUpdateChecks(): () => void {
  const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'background') {
      backgroundedAt = Date.now();
    } else if (state === 'active') {
      const away = backgroundedAt ? Date.now() - backgroundedAt : 0;
      backgroundedAt = null;
      checkAndFetch(away);
    }
  });
  return () => sub.remove();
}
