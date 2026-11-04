import { useRef, useState } from 'react';
import { PixelRatio, Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { captureRef } from 'react-native-view-shot';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { cosmosFont, useCosmos } from '../../src/theme/cosmos';
import { useSpaceAccess } from '../../src/context/SpaceAccessContext';
import { useAuth } from '../../src/context/AuthContext';
import usePlatformAdmin from '../../src/hooks/usePlatformAdmin';

const AVATAR = 28;
const IS_PAD = Platform.OS === 'ios' && Platform.isPad;

/**
 * Native tab icons are images, not views, so a photo can't be rounded with
 * borderRadius. Paint mine as a circle offscreen once it loads and snapshot it
 * to a PNG (transparent corners). Until then, or with no photo, the glyph shows.
 */
function useAvatarIcon(url: string | null | undefined) {
  const ref = useRef<View>(null);
  const [icon, setIcon] = useState<{ url: string; uri: string } | null>(null);
  const capture = () =>
    requestAnimationFrame(() => {
      if (!url || !ref.current) return;
      captureRef(ref, { format: 'png', result: 'tmpfile' })
        .then((uri) => setIcon({ url, uri }))
        .catch(() => {}); // keep the glyph
    });
  const node = url ? (
    <View ref={ref} collapsable={false} pointerEvents="none" accessibilityElementsHidden style={styles.capture}>
      <Image source={{ uri: url }} style={StyleSheet.absoluteFill} onLoad={capture} />
    </View>
  ) : null;
  const src = url && icon?.url === url ? { uri: icon.uri, width: AVATAR, height: AVATAR, scale: PixelRatio.get() } : null;
  return { src, node };
}

// iOS: the system tab bar (Liquid Glass on iOS 26+). It floats over content,
// shrinks while scrolling down and returns on scroll up. Icons are plain SF
// Symbols — no custom backgrounds behind them.
export default function TabsLayout() {
  // Monochrome cosmos: silver selected, muted idle (matches Home/Tickets/Profile).
  const c = useCosmos();
  // Operators only (Space Admin, Curator, Co-Curator, Crew, Judge, Mentor).
  const { sections } = useSpaceAccess();
  // Unifesto platform staff only.
  const isPlatformAdmin = usePlatformAdmin();
  const { user } = useAuth();
  const avatar = useAvatarIcon(user?.avatarUrl);

  return (
    <View style={styles.flex}>
      <NativeTabs
        tintColor={c.primary}
        iconColor={{ default: c.muted, selected: c.primary }}
        labelStyle={{
          default: { fontFamily: cosmosFont.strong.fontFamily, color: c.muted },
          selected: { fontFamily: cosmosFont.strong.fontFamily, color: c.primary },
        }}
        minimizeBehavior="onScrollDown"
      >
        {/* Icon-only on iPhone: labels are hidden but kept for VoiceOver. iPad puts the bar
            at the top, built around titles (blank with none), so there they show. */}
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf={{ default: 'rectangle.stack', selected: 'rectangle.stack.fill' }} />
          <NativeTabs.Trigger.Label hidden={!IS_PAD}>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="tickets">
          <NativeTabs.Trigger.Icon sf={{ default: 'wallet.pass', selected: 'wallet.pass.fill' }} />
          <NativeTabs.Trigger.Label hidden={!IS_PAD}>Tickets</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="space" hidden={sections.length === 0}>
          <NativeTabs.Trigger.Icon sf={{ default: 'square.stack.3d.up', selected: 'square.stack.3d.up.fill' }} />
          <NativeTabs.Trigger.Label hidden={!IS_PAD}>Space</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="apex" hidden={!isPlatformAdmin}>
          <NativeTabs.Trigger.Icon sf={{ default: 'crown', selected: 'crown.fill' }} />
          <NativeTabs.Trigger.Label hidden={!IS_PAD}>Apex</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          {avatar.src ? (
            <NativeTabs.Trigger.Icon src={avatar.src} renderingMode="original" />
          ) : (
            <NativeTabs.Trigger.Icon sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }} />
          )}
          <NativeTabs.Trigger.Label hidden={!IS_PAD}>Profile</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      {avatar.node}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  capture: { position: 'absolute', left: -1000, width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, overflow: 'hidden' },
});
