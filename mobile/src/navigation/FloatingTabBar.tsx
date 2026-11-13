import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cards, Crown, Stack, User, Wallet, type Icon } from '../components/ui/icons';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useCosmos } from '../theme/cosmos';
import { CardBackdrop, CardSurfaceProvider } from '../components/ui/CardSurface';
import { borderRadius, spacing } from '../theme/spacing';

export const TAB_META: Record<string, { label: string; icon: Icon }> = {
  index: { label: 'Home', icon: Cards },
  tickets: { label: 'Tickets', icon: Wallet },
  space: { label: 'Space', icon: Stack },
  apex: { label: 'Apex', icon: Crown },
  profile: { label: 'Profile', icon: User },
};

const ITEM_W = 64;
const GAP = spacing[1];
const DOT = 5;
const SPRING = { damping: 18, stiffness: 240 };

/**
 * Floating tab bar for Android (iOS uses the native Liquid Glass bar).
 * A glass capsule (solid base + veil, untinted) off the bottom edge, monochrome:
 * the active tab is a silver (ink by day), filled glyph with a small dot under
 * it that fades in place (never slides); inactive glyphs are muted. Nothing
 * behind icons.
 */
export default function FloatingTabBar({
  state,
  navigation,
  hiddenRoutes = [],
  avatarUrl,
}: BottomTabBarProps & { hiddenRoutes?: string[]; avatarUrl?: string | null }) {
  const c = useCosmos();
  const rippleColor = c.tint;
  const insets = useSafeAreaInsets();

  const visible = state.routes.filter((r) => TAB_META[r.name] && !hiddenRoutes.includes(r.name));

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing[3]) + 4 }]}>
      <View style={[styles.bar, { borderColor: c.border }]}>
        <CardSurfaceProvider kind="glass">
          <CardBackdrop shape={styles.bar} opaque />
        </CardSurfaceProvider>
        {visible.map((route) => {
          const meta = TAB_META[route.name];
          const focused = route.key === state.routes[state.index]?.key;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <TabItem
              key={route.key}
              label={meta.label}
              Icon={meta.icon}
              avatarUrl={route.name === 'profile' ? avatarUrl : null}
              focused={focused}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              color={focused ? c.primary : c.muted}
              dotColor={c.primary}
              rippleColor={rippleColor}
            />
          );
        })}
      </View>
    </View>
  );
}

function TabItem({
  label,
  Icon,
  avatarUrl,
  focused,
  onPress,
  onLongPress,
  color,
  dotColor,
  rippleColor,
}: {
  label: string;
  Icon: Icon;
  /** My photo in place of the Profile glyph, ringed while selected. */
  avatarUrl?: string | null;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  color: string;
  dotColor: string;
  rippleColor: string;
}) {
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(focused ? 1.06 : 1, SPRING) }],
  }));
  const dotStyle = useAnimatedStyle(() => ({ opacity: withTiming(focused ? 1 : 0, { duration: 150 }) }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      android_ripple={{ color: rippleColor, borderless: true, radius: 32 }}
      style={styles.item}
    >
      {/* Icon-only; the label stays as the accessibility name. */}
      <Animated.View style={iconStyle}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={[styles.avatar, { borderColor: focused ? color : 'transparent' }]} />
        ) : (
          <Icon size={26} color={color} weight={focused ? 'fill' : 'regular'} />
        )}
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.dot, { backgroundColor: dotColor }, dotStyle]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[2],
    paddingTop: spacing[2],
    paddingBottom: spacing[3],
    gap: GAP,
    // No shadow (Horizon); the glass veil lifts it by night, a hairline marks it by day.
    borderWidth: StyleSheet.hairlineWidth,
  },
  item: { width: ITEM_W, height: 40, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5 },
  // Sits where the old sliding bar did: 8pt above the capsule's bottom edge.
  dot: { position: 'absolute', bottom: -spacing[1], left: (ITEM_W - DOT) / 2, width: DOT, height: DOT, borderRadius: DOT / 2 },
});
