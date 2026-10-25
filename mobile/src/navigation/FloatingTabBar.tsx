import React, { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { House, ShieldCheck, SquaresFour, Ticket, User, type Icon } from '@unifesto/unicon/react-native';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useCosmos } from '../theme/cosmos';
import { borderRadius, spacing } from '../theme/spacing';

export const TAB_META: Record<string, { label: string; icon: Icon }> = {
  index: { label: 'Home', icon: House },
  tickets: { label: 'Tickets', icon: Ticket },
  space: { label: 'Space', icon: SquaresFour },
  apex: { label: 'Apex', icon: ShieldCheck },
  profile: { label: 'Profile', icon: User },
};

const ITEM_W = 64;
const GAP = spacing[1];
const INDICATOR_W = 18;
const SPRING = { damping: 18, stiffness: 240 };

/**
 * Floating tab bar for Android (iOS uses the native Liquid Glass bar).
 * An opaque cosmos capsule off the bottom edge; the active tab is a silver,
 * filled glyph with a short bar that slides between tabs — nothing behind icons.
 */
export default function FloatingTabBar({
  state,
  navigation,
  hiddenRoutes = [],
}: BottomTabBarProps & { hiddenRoutes?: string[] }) {
  const c = useCosmos();
  const rippleColor = c.tint;
  const insets = useSafeAreaInsets();

  const visible = state.routes.filter((r) => TAB_META[r.name] && !hiddenRoutes.includes(r.name));
  const activeSlot = Math.max(0, visible.findIndex((r) => r.key === state.routes[state.index]?.key));

  const x = useSharedValue(activeSlot * (ITEM_W + GAP));
  useEffect(() => {
    x.value = withSpring(activeSlot * (ITEM_W + GAP), SPRING);
  }, [activeSlot, x]);
  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing[3]) + 4 }]}>
      <View style={[styles.bar, { backgroundColor: c.raised }]}>
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
              focused={focused}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              color={focused ? c.primary : c.muted}
              rippleColor={rippleColor}
            />
          );
        })}
        <Animated.View
          pointerEvents="none"
          style={[styles.indicator, { backgroundColor: c.primary }, indicatorStyle]}
        />
      </View>
    </View>
  );
}

function TabItem({
  label,
  Icon,
  focused,
  onPress,
  onLongPress,
  color,
  rippleColor,
}: {
  label: string;
  Icon: Icon;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  color: string;
  rippleColor: string;
}) {
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(focused ? 1.06 : 1, SPRING) }],
  }));

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
        <Icon size={26} color={color} weight={focused ? 'fill' : 'regular'} />
      </Animated.View>
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
    // Tonal elevation: opaque, lifted off content scrolling beneath it.
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 18,
  },
  item: { width: ITEM_W, height: 40, alignItems: 'center', justifyContent: 'center' },
  indicator: {
    position: 'absolute',
    bottom: spacing[2],
    left: spacing[2] + (ITEM_W - INDICATOR_W) / 2,
    width: INDICATOR_W,
    height: 3,
    borderRadius: 2,
  },
});
