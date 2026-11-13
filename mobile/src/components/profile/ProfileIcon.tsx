import React from 'react';
import { Image } from 'expo-image';
import { useCosmos } from '../../theme/cosmos';

/**
 * Profile tab row icons: sonnycandra's "Basic UI" pack, gradient outline style
 * (flaticon.com/packs/basic-ui-17935685), 128px PNGs. Free Flaticon licence:
 * the credit line on About must stay while these ship. Recoloured at runtime to
 * one theme colour each (owner, 13 Nov: job accents), so night and day follow.
 */
const ICONS = {
  bookmark: require('../../../assets/icons/profile/bookmark.png'),
  brightness: require('../../../assets/icons/profile/brightness.png'),
  camera: require('../../../assets/icons/profile/camera.png'),
  clock: require('../../../assets/icons/profile/clock.png'),
  file: require('../../../assets/icons/profile/file.png'),
  help: require('../../../assets/icons/profile/help.png'),
  home: require('../../../assets/icons/profile/home.png'),
  information: require('../../../assets/icons/profile/information.png'),
  layer: require('../../../assets/icons/profile/layer.png'),
  light: require('../../../assets/icons/profile/light.png'),
  logout: require('../../../assets/icons/profile/logout.png'),
  notification: require('../../../assets/icons/profile/notification.png'),
  pencil: require('../../../assets/icons/profile/pencil.png'),
  plus: require('../../../assets/icons/profile/plus.png'),
  profile: require('../../../assets/icons/profile/profile.png'),
  star: require('../../../assets/icons/profile/star.png'),
  toggle: require('../../../assets/icons/profile/toggle.png'),
};

export type ProfileIconName = keyof typeof ICONS;

/** One size for every row icon on the Profile tab. */
export const PROFILE_ICON_SIZE = 22;

/**
 * One row icon in its job's accent (sky tickets and events, mint done, ivory the
 * star, crimson sign out), or the text colour for plain settings. `tintColor`
 * paints the outline in that colour. Decorative; the row label names it.
 */
export default function ProfileIcon({ name, color, size = PROFILE_ICON_SIZE }: { name: ProfileIconName; color?: string; size?: number }) {
  const c = useCosmos();
  return (
    <Image
      source={ICONS[name]}
      tintColor={color ?? c.text}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
