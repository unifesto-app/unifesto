import React from 'react';
import { Image } from 'expo-image';

/**
 * Profile tab row icons: sonnycandra's "Basic UI" pack, gradient outline style
 * (flaticon.com/packs/basic-ui-17935685), 128px PNGs. Free Flaticon licence:
 * the credit line on About must stay while these ship.
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

/** Multi-colour artwork: shown as drawn, never tinted. Decorative; the row label names it. */
export default function ProfileIcon({ name, size = PROFILE_ICON_SIZE }: { name: ProfileIconName; size?: number }) {
  return (
    <Image
      source={ICONS[name]}
      style={{ width: size, height: size }}
      contentFit="contain"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
