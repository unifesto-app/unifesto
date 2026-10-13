import { Linking, Platform } from 'react-native';
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

/** Forced update: a non-dismissable alert that only lets the user go update. */
function promptForcedUpdate(info: PlatformVersionInfo) {
  AppAlert.alert(
    'Update Required',
    'This version of Unifesto is no longer supported. Please update to the latest version to continue.',
    [
      {
        text: 'Update Now',
        onPress: () => {
          openStore(info.storeUrl);
          // The store trip backgrounds the app; if the user returns still on the
          // old build, surface the block again on next launch's check.
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

  if (res.kind === 'force') promptForcedUpdate(res.info);
  else if (res.kind === 'optional') {
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
