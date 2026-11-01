import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { androidGlassVeil, CardBackdrop, CardSurfaceProvider } from '../ui/CardSurface';
import type { RegisterMode } from '../../hooks/useEventDetail';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';
import useContentWidth from '../../hooks/useContentWidth';

const CTA_LABEL: Record<RegisterMode, string> = {
  umbrella: 'View sub-events',
  signIn: 'Sign in to register',
  registered: 'View my ticket',
  choose: 'Choose ticket',
  free: 'Register free',
  paid: 'Register',
  soldOut: 'Sold out',
  notOpen: 'Not open yet',
  closed: 'Registration closed',
};

/**
 * Bottom action bar, anchored to the screen edge: price on the left (small
 * label over a large value), the one primary action on the right. Once the
 * user is registered there's no price to show, so the button takes the row.
 */
export function RegisterBar({ price, mode, accent, onPress, backdropImage, backdropColor }: {
  /** e.g. { label: 'Starting from', value: '₹199' }; null hides the price. */
  price: { label: string; value: string } | null;
  mode: RegisterMode;
  accent: string;
  onPress: () => void;
  /** Event cover; blurred as the bar's backdrop on Android. */
  backdropImage?: string | null;
  /** The page wash colour the bar sits on (Android glass tint). */
  backdropColor?: string | null;
}) {
  const done = mode === 'registered';
  const unavailable = mode === 'soldOut' || mode === 'notOpen' || mode === 'closed';
  return (
    <ActionBar
      info={done || unavailable ? null : price}
      label={CTA_LABEL[mode]}
      disabled={unavailable}
      accent={accent}
      onPress={onPress}
      backdropImage={backdropImage}
      backdropColor={backdropColor}
    />
  );
}

/**
 * Bottom padding a scroll view needs so its last item clears the floating
 * ActionBar (which is absolutely positioned over the content), plus `gap`.
 */
export function useActionBarSpace(gap: number = spacing[6]) {
  return spacing[4] + 52 + useBarBottomPad() + gap;
}

/** Space under the CTA: clears the home indicator / nav bar, plus breathing room. */
function useBarBottomPad() {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, spacing[4]) + spacing[3];
}

/**
 * Bottom action bar anchored to the screen edge, on glass (floating chrome):
 * an optional info column (small label over a large value) and the one primary
 * button, silver by night and ink by day. Without info the button takes the
 * full row. Shared by the event, space and session pages.
 */
export function ActionBar({ info, label, onPress, disabled = false, loading = false, backdropImage, backdropColor }: {
  info: { label: string; value: string } | null;
  label: string;
  onPress: () => void;
  /** Ignored: the button is always the primary (buttons never take an accent). Kept for callers. */
  accent?: string;
  /** Ignored, as `accent`. */
  tone?: 'accent' | 'neutral';
  disabled?: boolean;
  loading?: boolean;
  /** Android only: an image (e.g. the event cover) drawn faint and blurred behind the bar. */
  backdropImage?: string | null;
  /** Android: the page colour under the bar; the glass is a lighter veil of it. */
  backdropColor?: string | null;
}) {
  const { tokens, isDark } = useTheme();
  const c = useCosmos();
  const bottomPad = useBarBottomPad();
  const { inset } = useContentWidth();
  // iOS: glass (Liquid Glass on 26+, frosted below). Android can't live-blur what
  // scrolls under the bar, so it uses the frosted branch below.
  const glass = Platform.OS === 'ios';
  return (
    <View
      style={[
        styles.bar,
        { left: inset, right: inset, paddingBottom: bottomPad },
      ]}
    >
      {Platform.OS === 'android' ? (
        // Frosted glass, opaque: the page's own colour, a faint blurred cover for
        // texture, then the same light veil Android cards use, lifting it above
        // the page (a black wash just made it black).
        <View
          style={[StyleSheet.absoluteFill, styles.barShape, styles.clip, { backgroundColor: backdropColor ?? tokens.bg }]}
          pointerEvents="none"
        >
          {backdropImage ? (
            <Image source={{ uri: backdropImage }} style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} contentFit="cover" blurRadius={40} />
          ) : null}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: androidGlassVeil(isDark) }]} />
          <View style={[styles.sheen, { backgroundColor: tokens.border }]} />
        </View>
      ) : (
        <CardSurfaceProvider kind={glass ? 'glass' : 'solid'}>
          <CardBackdrop style={styles.barShape} />
        </CardSurfaceProvider>
      )}
      {info ? (
        <View style={styles.priceCol}>
          <Text style={[styles.barLabel, { color: c.muted }]} numberOfLines={1}>{info.label}</Text>
          <Text style={[styles.barValue, { color: c.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {info.value}
          </Text>
        </View>
      ) : null}
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        style={({ pressed }) => [
          styles.cta,
          info ? styles.ctaBeside : styles.ctaFull,
          {
            backgroundColor: c.primary,
            opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={c.primaryFg} />
        ) : (
          <Text style={[styles.ctaText, { color: c.primaryFg }]} numberOfLines={1}>
            {label}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[4],
    paddingTop: spacing[4],
    paddingHorizontal: spacing[5],
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
  },
  barShape: {
    borderRadius: 0,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
  },
  clip: { overflow: 'hidden' },
  // Hairline light along the top edge of the frosted Android bar.
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
  priceCol: { flex: 1, minWidth: 0 },
  barLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  barValue: { fontSize: typography.fontSize.xl, marginTop: 1, ...cosmosFont.figure },
  cta: { height: 52, borderRadius: cosmosRadius, alignItems: 'center', justifyContent: 'center' },
  // Sized by its label (never squeezed below a comfortable tap target).
  ctaBeside: { flexShrink: 0, minWidth: 148, paddingHorizontal: spacing[6] },
  ctaFull: { flex: 1 },
  ctaText: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
});
