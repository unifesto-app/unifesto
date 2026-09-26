import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { androidGlassVeil, CardBackdrop, CardSurfaceProvider, useCardSurface } from '../ui/CardSurface';
import type { RegisterMode } from '../../hooks/useEventDetail';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const CTA_LABEL: Record<RegisterMode, string> = {
  umbrella: 'View sub-events',
  signIn: 'Sign in to register',
  registered: 'View my ticket',
  addTicket: 'Add a ticket',
  choose: 'Choose ticket',
  free: 'Register free',
  paid: 'Register',
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
  return (
    <ActionBar
      info={done ? null : price}
      label={CTA_LABEL[mode]}
      tone={done ? 'neutral' : 'accent'}
      accent={accent}
      onPress={onPress}
      backdropImage={backdropImage}
      backdropColor={backdropColor}
    />
  );
}

/**
 * Bottom action bar anchored to the screen edge: an optional info column
 * (small label over a large value) and one primary button. Without info the
 * button takes the full row. Shared by the event and space pages.
 */
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

export function ActionBar({ info, label, onPress, accent, tone = 'accent', disabled = false, loading = false, backdropImage, backdropColor }: {
  info: { label: string; value: string } | null;
  label: string;
  onPress: () => void;
  accent: string;
  /** 'neutral' = white button, for "already done" states. */
  tone?: 'accent' | 'neutral';
  disabled?: boolean;
  loading?: boolean;
  /** Android only: an image (e.g. the event cover) drawn faint and blurred behind the bar. */
  backdropImage?: string | null;
  /** Android: the page colour under the bar; the glass is a lighter veil of it. */
  backdropColor?: string | null;
}) {
  const { tokens, isDark } = useTheme();
  const bottomPad = useBarBottomPad();
  const neutral = tone === 'neutral';
  // Android can't live-blur what scrolls under the bar (only a flat tint), so it
  // always uses the frosted branch below instead of CardBackdrop.
  const glass = useCardSurface() === 'glass' && Platform.OS !== 'android';
  return (
    <View
      style={[
        styles.bar,
        { paddingBottom: bottomPad },
        glass && styles.barGlass,
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
          <Text style={[styles.barLabel, { color: tokens.textMuted }]} numberOfLines={1}>{info.label}</Text>
          <Text style={[styles.barValue, { color: tokens.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {info.value}
          </Text>
        </View>
      ) : null}
      <Pressable
        onPress={onPress}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityState={{ disabled: disabled || loading, busy: loading }}
        style={({ pressed }) => [
          styles.cta,
          info ? styles.ctaBeside : styles.ctaFull,
          {
            backgroundColor: neutral ? tokens.text : accent,
            opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
          },
        ]}
      >
        {loading ? (
          <ActivityIndicator color={neutral ? tokens.bg : '#ffffff'} />
        ) : (
          <Text style={[styles.ctaText, { color: neutral ? tokens.bg : '#ffffff' }]} numberOfLines={1}>
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
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 20,
  },
  barShape: {
    borderRadius: 0,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
  },
  clip: { overflow: 'hidden' },
  // Hairline light along the top edge of the frosted Android bar.
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
  // Glass draws its own depth; a heavy black shadow under it just muddies it.
  barGlass: { shadowOpacity: 0, elevation: 0 },
  priceCol: { flex: 1, minWidth: 0 },
  barLabel: { fontSize: typography.fontSize.xs, ...font('medium') },
  barValue: { fontSize: typography.fontSize.xl, marginTop: 1, ...font('heading') },
  cta: { height: 52, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  // Sized by its label (never squeezed below a comfortable tap target).
  ctaBeside: { flexShrink: 0, minWidth: 148, paddingHorizontal: spacing[6] },
  ctaFull: { flex: 1 },
  ctaText: { fontSize: typography.fontSize.base, ...font('semibold') },
});
