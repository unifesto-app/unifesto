import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { House, ShieldCheck, SquaresFour, Ticket, User, type Icon } from 'phosphor-react-native';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useTokens } from '../context/ThemeContext';
import { borderRadius, spacing } from '../theme/spacing';

export const TAB_META: Record<string, { label: string; icon: Icon }> = {
  index: { label: 'Home', icon: House },
  tickets: { label: 'Tickets', icon: Ticket },
  space: { label: 'Space', icon: SquaresFour },
  apex: { label: 'Apex', icon: ShieldCheck },
  profile: { label: 'Profile', icon: User },
};

/**
 * Floating tab bar for Android (iOS uses the native Liquid Glass bar).
 * A compact dark capsule off the bottom edge; the active tab is shown by
 * colour, a filled icon and a small dot — no pill or chip behind icons.
 */
export default function FloatingTabBar({
  state,
  navigation,
  hiddenRoutes = [],
}: BottomTabBarProps & { hiddenRoutes?: string[] }) {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing[3]) + 4 }]}>
      <View style={[styles.bar, { backgroundColor: tokens.scheme === 'dark' ? 'rgba(20,20,20,0.96)' : 'rgba(255,255,255,0.96)' }]}>
        {state.routes.map((route, index) => {
          const meta = TAB_META[route.name];
          if (!meta || hiddenRoutes.includes(route.name)) return null;
          const focused = state.index === index;
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
              activeColor={tokens.accent}
              idleColor={tokens.textMuted}
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
  focused,
  onPress,
  onLongPress,
  activeColor,
  idleColor,
}: {
  label: string;
  Icon: Icon;
  focused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  activeColor: string;
  idleColor: string;
}) {
  const rippleColor = useTokens().pressed;
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: withSpring(focused ? 1.08 : 1, { damping: 14, stiffness: 220 }) }],
  }));
  const dotStyle = useAnimatedStyle(() => ({
    opacity: withTiming(focused ? 1 : 0, { duration: 160 }),
    transform: [{ scale: withSpring(focused ? 1 : 0.2, { damping: 14, stiffness: 220 }) }],
  }));
  const color = focused ? activeColor : idleColor;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={label}
      android_ripple={{ color: rippleColor, borderless: true, radius: 36 }}
      style={styles.item}
    >
      {/* Icon-only; the label stays as the accessibility name. */}
      <Animated.View style={iconStyle}>
        <Icon size={26} color={color} weight={focused ? 'fill' : 'regular'} />
      </Animated.View>
      <Animated.View style={[styles.dot, { backgroundColor: activeColor }, dotStyle]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' },
  bar: {
    flexDirection: 'row',
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    gap: spacing[2],
    // Lifts the capsule off content scrolling beneath it.
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  item: { width: 64, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, gap: 4 },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});
