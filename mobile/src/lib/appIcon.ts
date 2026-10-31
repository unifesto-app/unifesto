import { Platform } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

/**
 * Alternate app icons (expo-alternate-app-icons). The native side is set up by
 * the plugin in app.config.js, whose names must match these keys.
 *
 * The module is loaded defensively: a binary built before the plugin was added
 * (or Expo Go) has no native module, and importing it would throw at startup.
 * There the picker simply doesn't show.
 */
type IconModule = typeof import('expo-alternate-app-icons');
let mod: IconModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require('expo-alternate-app-icons') as IconModule;
} catch {
  mod = null;
}

/** 'Auto' (iOS only) is the store icon itself, which follows the system appearance: Day by day, Night by night. */
export type AppIconName = 'Auto' | 'Night' | 'Day' | 'Mint' | 'Sky' | 'Ivory' | 'Blue' | 'Dark' | 'Light';

export const APP_ICONS: { name: AppIconName; label: string; preview: ImageSourcePropType }[] = [
  ...(Platform.OS === 'ios'
    ? [{ name: 'Auto' as const, label: 'Auto', preview: require('../../assets/app-icons/auto-preview.png') }]
    : []),
  { name: 'Night', label: 'Night', preview: require('../../assets/app-icons/night-preview.png') },
  { name: 'Day', label: 'Day', preview: require('../../assets/app-icons/day-preview.png') },
  // Product on a shade (guidelines §08), then the two plains.
  { name: 'Mint', label: 'Mint', preview: require('../../assets/app-icons/mint-preview.png') },
  { name: 'Sky', label: 'Sky', preview: require('../../assets/app-icons/sky-preview.png') },
  { name: 'Ivory', label: 'Ivory', preview: require('../../assets/app-icons/ivory-preview.png') },
  { name: 'Blue', label: 'Blue', preview: require('../../assets/app-icons/blue-preview.png') },
  { name: 'Dark', label: 'Dark', preview: require('../../assets/app-icons/dark-preview.png') },
  { name: 'Light', label: 'Light', preview: require('../../assets/app-icons/light-preview.png') },
];

/** The icon each store build ships with (app.config.js `ios.icon` / `android.icon`). */
const PLATFORM_DEFAULT: AppIconName = Platform.OS === 'ios' ? 'Auto' : 'Night';

export const appIconsSupported = (): boolean => {
  try {
    return !!mod?.supportsAlternateIcons;
  } catch {
    return false;
  }
};

/**
 * The icon on the home screen right now: the platform default when none is set,
 * or when the set one was retired (Aurora, Nebula, Ember, Ocean and Mono went on 31 Oct 2026).
 */
export function currentAppIcon(): AppIconName {
  try {
    const name = mod?.getAppIconName();
    return APP_ICONS.find((i) => i.name === name)?.name ?? PLATFORM_DEFAULT;
  } catch {
    return PLATFORM_DEFAULT;
  }
}

/** Switch the home-screen icon. Picking the platform's own default resets instead. */
export async function setAppIcon(name: AppIconName): Promise<void> {
  if (!mod) throw new Error('App icons are not available in this build');
  await mod.setAlternateAppIcon(name === PLATFORM_DEFAULT ? null : name);
}

/** Preview art for the icon on the home screen now (the About hero shows it). */
export const currentAppIconPreview = (): ImageSourcePropType =>
  (APP_ICONS.find((i) => i.name === currentAppIcon()) ?? APP_ICONS[0]).preview;
