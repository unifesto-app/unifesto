import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import { getAppVersion, PlatformVersionInfo } from './api/appVersion';
import { AppAlert } from '../components/ui/AppAlert';

/**
 * Compare two dotted version strings (e.g. "2.0.1" vs "2.1.0").
 * Returns -1 if a < b, 1 if a > b, 0 if equal. Missing/short segments are
 * treated as 0 ("2.0" == "2.0.0"); non-numeric segments are treated as 0 so a
 * malformed value can never throw during a startup check.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = parseInt(pa[i] ?? '0', 10) || 0;
    const nb = parseInt(pb[i] ?? '0', 10) || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

function openStore(url: string) {
  Linking.openURL(url).catch(() => {});
}

/** Set once the forced prompt is up. It never closes, so later checks have nothing to add. */
let forcedShown = false;

/** Forced update: a non-dismissable alert that only lets the user go update. */
function promptForcedUpdate(info: PlatformVersionInfo) {
  forcedShown = true;
  AppAlert.alert(
    'Update Required',
    'This version of Unifesto is no longer supported. Please update to the latest version to continue.',
    [
      {
        text: 'Update Now',
        onPress: () => {
          openStore(info.storeUrl);
          // Tapping closes the alert, so put it straight back: coming back from
          // the store still on this build must land on the block, not the app.
          promptForcedUpdate(info);
        },
      },
    ],
    {
      cancelable: false,
      // Android hardware-back dismiss → keep it blocking by re-prompting.
      onDismiss: () => promptForcedUpdate(info),
    },
  );
}

/** latestVersion the soft prompt was last shown for; it shows once per version. */
const SOFT_PROMPT_KEY = 'appUpdate.softPromptShownFor';

/** Optional update: a dismissable alert with Update / Later. */
function promptOptionalUpdate(info: PlatformVersionInfo) {
  AppAlert.alert(
    'Update available',
    `Version ${info.latestVersion} of Unifesto is out with the latest features and fixes.`,
    [
      { text: 'Later', style: 'cancel' },
      { text: 'Update', onPress: () => openStore(info.storeUrl) },
    ],
    { cancelable: true },
  );
}

let watchingForeground = false;

/**
 * Re-run the automatic check whenever the app comes back from the background,
 * so a minimum version raised while it sat there still blocks (the app may not
 * be cold-started for days). Registered once, for the app's lifetime.
 */
function watchForeground() {
  if (watchingForeground) return;
  watchingForeground = true;
  let last = AppState.currentState;
  AppState.addEventListener('change', (state) => {
    if (state === 'active' && last === 'background') void checkForAppUpdate();
    last = state;
  });
}

export interface CheckForUpdateOptions {
  /**
   * A user-initiated check (e.g. tapping the version in the footer). In manual
   * mode the "you're up to date" and "couldn't check" cases surface an alert so
   * the tap always gives feedback. The automatic startup check stays silent in
   * those cases so a bad network never nags the user.
   */
  manual?: boolean;
}

/**
 * Check the installed build against the backend version policy and, if needed,
 * prompt the user to update. Silent (no-op) when up to date, on web, when the
 * installed version can't be read, or when the policy can't be fetched — unless
 * `manual` is set, in which case those cases get user-facing feedback.
 */
export async function checkForAppUpdate(
  options: CheckForUpdateOptions = {},
): Promise<void> {
  const { manual = false } = options;
  if (!manual) watchForeground();
  if (forcedShown) return;

  const res = await getStoreUpdate();
  if (res === null) return;
  if (res === 'unreachable') {
    if (manual) {
      AppAlert.alert(
        'Couldn’t check for updates',
        'Please check your connection and try again.',
      );
    }
    return;
  }

  if (res.kind === 'force') {
    // An overlapping check may have put the block up while this one was fetching.
    if (!forcedShown) promptForcedUpdate(res.info);
  } else if (res.kind === 'optional') {
    // Startup nudges once per store version; a manual check always answers.
    if (!manual) {
      try {
        if ((await AsyncStorage.getItem(SOFT_PROMPT_KEY)) === res.info.latestVersion) return;
        await AsyncStorage.setItem(SOFT_PROMPT_KEY, res.info.latestVersion);
      } catch {
        return; // Storage unavailable: skip rather than nag every launch.
      }
    }
    promptOptionalUpdate(res.info);
  } else if (manual) {
    AppAlert.alert('You’re up to date', `You’re on the latest version (${res.installed}).`);
  }
}

export interface StoreUpdate {
  /** force = below the supported floor; optional = behind latest. */
  kind: 'force' | 'optional' | 'current';
  installed: string;
  info: PlatformVersionInfo;
}

/**
 * Where this install stands against the backend version policy, without
 * prompting. null when there is nothing to compare (web, unknown version, no
 * policy for this platform); 'unreachable' when the policy can't be fetched.
 */
export async function getStoreUpdate(): Promise<StoreUpdate | 'unreachable' | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;

  const installed = Application.nativeApplicationVersion;
  if (!installed) return null;

  const policy = await getAppVersion();
  if (!policy) return 'unreachable';

  const info = Platform.OS === 'ios' ? policy.ios : policy.android;
  if (!info) return null;

  // An empty latestVersion turns the soft prompt off; the minimum still applies.
  const kind =
    info.minimumVersion && compareVersions(installed, info.minimumVersion) < 0
      ? 'force'
      : info.latestVersion && compareVersions(installed, info.latestVersion) < 0
        ? 'optional'
        : 'current';
  return { kind, installed, info };
}

/** Open the store listing for this platform. */
export function openStoreListing(info: PlatformVersionInfo): void {
  openStore(info.storeUrl);
}
