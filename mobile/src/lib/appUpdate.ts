import { Linking, Platform } from 'react-native';
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

/** Optional update: a dismissable alert with Update / Later. */
function promptOptionalUpdate(info: PlatformVersionInfo) {
  AppAlert.alert(
    'Update Available',
    'A new version of Unifesto is available with the latest features and fixes.',
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

  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;

  const installed = Application.nativeApplicationVersion;
  if (!installed) return;

  const policy = await getAppVersion();
  if (!policy) {
    if (manual) {
      AppAlert.alert(
        'Couldn’t check for updates',
        'Please check your connection and try again.',
      );
    }
    return;
  }

  const info = Platform.OS === 'ios' ? policy.ios : policy.android;
  if (!info?.latestVersion) return;

  // Below the supported floor → force. Otherwise, behind latest → offer.
  if (info.minimumVersion && compareVersions(installed, info.minimumVersion) < 0) {
    promptForcedUpdate(info);
  } else if (compareVersions(installed, info.latestVersion) < 0) {
    promptOptionalUpdate(info);
  } else if (manual) {
    AppAlert.alert('You’re up to date', `You’re on the latest version (${installed}).`);
  }
}
