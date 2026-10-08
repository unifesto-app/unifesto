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

export type AppIconName = 'Night' | 'Day' | 'Aurora' | 'Nebula' | 'Ember' | 'Ocean' | 'Mono';

export const APP_ICONS: { name: AppIconName; label: string; preview: ImageSourcePropType }[] = [
  { name: 'Night', label: 'Night', preview: require('../../assets/app-icons/night-preview.png') },
  { name: 'Day', label: 'Day', preview: require('../../assets/app-icons/day-preview.png') },
  { name: 'Aurora', label: 'Aurora', preview: require('../../assets/app-icons/aurora-preview.png') },
  { name: 'Nebula', label: 'Nebula', preview: require('../../assets/app-icons/nebula-preview.png') },
  { name: 'Ember', label: 'Ember', preview: require('../../assets/app-icons/ember-preview.png') },
  { name: 'Ocean', label: 'Ocean', preview: require('../../assets/app-icons/ocean-preview.png') },
  { name: 'Mono', label: 'Mono', preview: require('../../assets/app-icons/mono-preview.png') },
];

/** The icon each store build ships with (app.config.js `ios.icon` / `android.icon`). */
const PLATFORM_DEFAULT: AppIconName = Platform.OS === 'ios' ? 'Day' : 'Night';

export const appIconsSupported = (): boolean => {
  try {
    return !!mod?.supportsAlternateIcons;
  } catch {
    return false;
  }
};

/** The icon on the home screen right now (the platform default when none is set). */
export function currentAppIcon(): AppIconName {
  try {
    return (mod?.getAppIconName() as AppIconName | null) ?? PLATFORM_DEFAULT;
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
