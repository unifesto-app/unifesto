import { Platform } from 'react-native';
import * as Application from 'expo-application';
import * as Updates from 'expo-updates';
import { getCrashlytics, setAttributes } from '@react-native-firebase/crashlytics';

/**
 * What exactly is running on this phone: the store build and, on top of it,
 * the OTA update (if any). Shown in Profile › About, sent with support tickets
 * and set on Crashlytics, so a crash or a report can be tied to one update.
 */
export interface BuildInfo {
  platform: string;
  /** Store version, e.g. "4.0.5". */
  version: string | null;
  /** Store build number (EAS auto-increments it). */
  build: string | null;
  /** Fingerprint runtime this binary accepts OTA updates for. */
  runtimeVersion: string | null;
  /** EAS Update channel ("production", "preview"). */
  channel: string | null;
  /** The running OTA update's id; null when running the code shipped in the build. */
  updateId: string | null;
  /** When that update was published. */
  updateCreatedAt: string | null;
  /** True after a failed update forced a fallback to the build's own code. */
  emergencyLaunch: boolean;
}

export function buildInfo(): BuildInfo {
  const fromUpdate = Updates.isEnabled && !Updates.isEmbeddedLaunch;
  return {
    platform: `${Platform.OS} ${Platform.Version}`,
    version: Application.nativeApplicationVersion,
    build: Application.nativeBuildVersion,
    runtimeVersion: Updates.isEnabled ? Updates.runtimeVersion : null,
    channel: Updates.isEnabled ? Updates.channel : null,
    updateId: fromUpdate ? Updates.updateId : null,
    updateCreatedAt: fromUpdate && Updates.createdAt ? Updates.createdAt.toISOString() : null,
    emergencyLaunch: Updates.isEnabled && Updates.isEmergencyLaunch,
  };
}

/** "4.0.5 (57) · update 1a2b3c4" or "4.0.5 (57)" when running the build's own code. */
export function buildLabel(info: BuildInfo = buildInfo()): string {
  const base = `${info.version ?? '?'}${info.build ? ` (${info.build})` : ''}`;
  return info.updateId ? `${base} · update ${info.updateId.slice(0, 7)}` : base;
}

/** Tag Crashlytics reports with the running build and update. Best-effort. */
export function tagCrashReports(): void {
  const info = buildInfo();
  setAttributes(getCrashlytics(), {
    app_version: info.version ?? '',
    app_build: info.build ?? '',
    runtime_version: info.runtimeVersion ?? '',
    update_channel: info.channel ?? '',
    update_id: info.updateId ?? 'embedded',
    emergency_launch: String(info.emergencyLaunch),
  }).catch(() => {});
}
