import { requireOptionalNativeModule } from 'expo';

export type ClipHandoff = { path: string; savedAt: number };

type NativeModule = { take(): Partial<ClipHandoff> | null };

// Optional: Android and dev clients built before this module have no native side.
const native = requireOptionalNativeModule<NativeModule>('ClipHandoff');

/** Takes (and clears) what the App Clip left behind. iOS only; null elsewhere. */
export function takeClipHandoff(): ClipHandoff | null {
  try {
    const value = native?.take();
    if (!value || typeof value.path !== 'string' || typeof value.savedAt !== 'number') return null;
    return { path: value.path, savedAt: value.savedAt };
  } catch {
    return null;
  }
}
