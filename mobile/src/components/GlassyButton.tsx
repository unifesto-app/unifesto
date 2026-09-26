/**
 * GlassyButton — React Native port of the Framer "Glassy button" component
 * https://framer.com/m/Glassy-button-wkgf.js@kR90p8CxkIlZ7L6xYHsR
 *
 * Design: metallic gradient ring → inner frosted glass panel → icon with
 * offset shadow layer. Spring-animated press, flat disabled state.
 */

import React, { useRef, ReactNode } from 'react';
import {
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GlassyButtonVariant = 'dark' | 'light';
export type GlassyButtonShape = 'circle' | 'square';

interface GlassyButtonProps {
  /** Icon or content rendered inside */
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /** 'dark' = black glass (for dark screens), 'light' = silver metal (like Framer original) */
  variant?: GlassyButtonVariant;
  /** 'circle' = fully round (default), 'square' = rounded rect with no inner border */
  shape?: GlassyButtonShape;
  /** When true, both gradient layers are fully transparent — just the icon, no background */
  transparent?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
  activeOpacity?: number;
}

// ─── Gradient presets ─────────────────────────────────────────────────────────

/** Outer metallic ring — same stops as the Framer source */
const RING_LIGHT: [string, string, string, string, string] = [
  'rgba(255,255,255,0.9)',
  'rgba(201,201,201,0.85)',
  'rgba(130,130,130,0.8)',
  'rgba(90,90,90,0.75)',
  'rgba(255,255,255,0.6)',
];

const RING_DARK: [string, string, string, string, string] = [
  'rgba(255,255,255,0.25)',
  'rgba(180,180,180,0.12)',
  'rgba(80,80,80,0.2)',
  'rgba(30,30,30,0.35)',
  'rgba(255,255,255,0.15)',
];

/** Inner frosted panel */
const INNER_LIGHT: [string, string, string] = [
  'rgb(215,215,215)',
  'rgb(208,208,208)',
  'rgb(200,200,200)',
];

const INNER_DARK: [string, string, string] = [
  'rgba(255,255,255,0.12)',
  'rgba(255,255,255,0.07)',
  'rgba(255,255,255,0.04)',
];

/** Disabled — flat */
const DISABLED_COLORS: [string, string] = [
  'rgba(100,100,100,0.3)',
  'rgba(80,80,80,0.2)',
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function GlassyButton({
  children,
  onPress,
  disabled = false,
  variant = 'dark',
  shape = 'circle',
  transparent = false,
  size = 52,
  style,
}: GlassyButtonProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const shadowOpacity = useRef(new Animated.Value(1)).current;

  const isSquare = shape === 'square';
  const borderRadius = isSquare ? Math.round(size * 0.28) : size / 2;
  const innerSize = size - 6;
  const innerRadius = isSquare ? Math.round(innerSize * 0.28) : innerSize / 2;

  const isLight = variant === 'light';

  /** Fully transparent stops used when transparent=true */
  const CLEAR: [string, string] = ['transparent', 'transparent'];

  const handlePressIn = () => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 0.91,
        useNativeDriver: true,
        damping: 10,
        stiffness: 300,
        mass: 0.6,
      }),
      Animated.spring(shadowOpacity, {
        toValue: 0.3,
        useNativeDriver: true,
        damping: 10,
        stiffness: 300,
        mass: 0.6,
      }),
    ]).start();
  };

  const handlePressOut = () => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        damping: 8,
        stiffness: 250,
        mass: 0.7,
      }),
      Animated.spring(shadowOpacity, {
        toValue: 1,
        useNativeDriver: true,
        damping: 8,
        stiffness: 250,
        mass: 0.7,
      }),
    ]).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      style={[{ width: size, height: size }, style]}
    >
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius,
            transform: [{ scale }],
            opacity: disabled ? 0.45 : 1,
          },
          // Suppress shadow when transparent
          !transparent && (Platform.OS === 'ios'
            ? {
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 12,
            }
            : { elevation: 6 }),
        ]}
      >
        {/* ── Outer metallic ring ───────────────────────────────────────── */}
        <LinearGradient
          colors={
            transparent
              ? CLEAR
              : disabled
                ? DISABLED_COLORS
                : isLight
                  ? RING_LIGHT
                  : RING_DARK
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[
            styles.ring,
            { width: size, height: size, borderRadius },
          ]}
        >
          {/* ── Inner frosted panel ──────────────────────────────────────── */}
          <LinearGradient
            colors={
              transparent
                ? CLEAR
                : disabled
                  ? DISABLED_COLORS
                  : isLight
                    ? INNER_LIGHT
                    : INNER_DARK
            }
            start={{ x: 0.2, y: 0 }}
            end={{ x: 0.8, y: 1 }}
            style={[
              styles.inner,
              {
                width: innerSize,
                height: innerSize,
                borderRadius: innerRadius,
                // Only draw the highlight border on circle variant
                ...(!isSquare && {
                  borderTopWidth: 0.5,
                  borderTopColor: isLight
                    ? 'rgba(255,255,255,0.9)'
                    : 'rgba(255,255,255,0.3)',
                  borderWidth: 0.5,
                  borderColor: isLight
                    ? 'rgba(200,200,200,0.5)'
                    : 'rgba(255,255,255,0.08)',
                }),
              },
            ]}
          >
            {/* ── Icon with shadow layer ───────────────────────────────── */}
            <View style={styles.iconLayer}>
              {/* Shadow copy — white, offset, behind main icon */}
              <View
                style={[
                  styles.iconShadow,
                  {
                    opacity: disabled ? 0 : isLight ? 0.5 : 0.25,
                  },
                ]}
              >
                {children}
              </View>

              {/* Main icon */}
              <View style={styles.iconMain}>{children}</View>
            </View>
          </LinearGradient>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  inner: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconLayer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconShadow: {
    position: 'absolute',
    // offset to simulate the Framer shadow icon (2px right, 2px down)
    transform: [{ translateX: 2 }, { translateY: 2 }],
  },
  iconMain: {
    position: 'relative',
    zIndex: 1,
  },
});
