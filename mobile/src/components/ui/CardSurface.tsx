import React, { createContext, useContext } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../context/ThemeContext';
import { borderRadius } from '../../theme/spacing';

/** iOS 26+ renders Apple's Liquid Glass; everything else gets solid / frosted. */
export const LIQUID_GLASS = isLiquidGlassAvailable();

export type CardSurfaceKind = 'solid' | 'glass';

const ANDROID = Platform.OS === 'android';

/**
 * App-wide default: Liquid Glass where the OS has it, and the light veil
 * glass on Android. iOS < 26 stays solid `elevated`.
 */
export const DEFAULT_CARD_SURFACE: CardSurfaceKind = LIQUID_GLASS || ANDROID ? 'glass' : 'solid';

/**
 * Android glass. Android can't live-blur what's behind a view (expo-blur's
 * fallback is a darkening tint), so glass there is a light veil: it lifts the
 * card above whatever it sits on (the black canvas or a banner wash) and lets
 * that colour through.
 */
export function androidGlassVeil(isDark: boolean) {
  return isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.7)';
}

const CardSurfaceContext = createContext<CardSurfaceKind>(DEFAULT_CARD_SURFACE);

/** Overrides the card surface for everything below it (e.g. glass over a banner wash). */
export function CardSurfaceProvider({ kind, children }: { kind: CardSurfaceKind; children: React.ReactNode }) {
  return <CardSurfaceContext.Provider value={kind}>{children}</CardSurfaceContext.Provider>;
}

export const useCardSurface = () => useContext(CardSurfaceContext);

const RADIUS_KEYS = [
  'borderRadius',
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomLeftRadius',
  'borderBottomRightRadius',
] as const;

/** Only the corner radii of a card style (never its padding / margins / size). */
function radiiOf(shape: StyleProp<ViewStyle>): ViewStyle {
  const flat = StyleSheet.flatten(shape) ?? {};
  const out: ViewStyle = {};
  for (const k of RADIUS_KEYS) if (flat[k] != null) (out as any)[k] = flat[k];
  return out;
}

/**
 * The card's surface. Render it as the FIRST child of a card that has NO
 * backgroundColor of its own; it paints the fill for every mode:
 *   solid → `tokens.elevated` · glass on iOS 26+ → Liquid Glass ·
 *   glass on Android → light veil (+ solid base when `opaque`) ·
 *   glass on iOS < 26 → frosted blur + sheen.
 * `shape` = the card's style (only its corner radii are used).
 * Never put `opacity` < 1 on the card or its ancestors: it breaks Liquid Glass
 * (use a scale transform for press feedback).
 */
export function CardBackdrop({ shape, style, opaque = false }: {
  shape?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle>;
  /** Floating surfaces (alerts, sheets): Android glass gets a solid base so nothing shows through. */
  opaque?: boolean;
}) {
  const kind = useCardSurface();
  const { tokens, isDark } = useTheme();
  const fill = [StyleSheet.absoluteFill, { borderRadius: borderRadius.xl }, shape ? radiiOf(shape) : null, style];

  if (kind === 'solid') {
    return <View style={[fill, { backgroundColor: tokens.elevated }]} pointerEvents="none" />;
  }

  if (LIQUID_GLASS) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={isDark ? 'dark' : 'light'}
        style={fill}
        pointerEvents="none"
      />
    );
  }

  if (ANDROID) {
    return (
      <View style={[fill, { overflow: 'hidden' }, opaque && { backgroundColor: tokens.elevated }]} pointerEvents="none">
        <View style={[StyleSheet.absoluteFill, { backgroundColor: androidGlassVeil(isDark) }]} />
        {isDark ? (
          <LinearGradient
            colors={[tokens.fill, `${tokens.bg}00`]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.25, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </View>
    );
  }

  // Frosted fallback (iOS < 26): blur + a sheen fading down from the top edge.
  return (
    <View style={[fill, { overflow: 'hidden' }]} pointerEvents="none">
      <BlurView
        intensity={isDark ? 40 : 60}
        tint={isDark ? 'systemUltraThinMaterialDark' : 'systemUltraThinMaterialLight'}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[tokens.fillStrong, tokens.fill, `${tokens.bg}00`]}
        locations={[0, 0.35, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.25, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

/**
 * Bare Liquid Glass fill for small controls (pills, chips, tracks) whose
 * non-glass fallback is NOT `tokens.elevated`. Renders nothing below iOS 26,
 * so the caller keeps its own solid style there. Same rule as CardBackdrop:
 * first child, no opacity < 1 on it or its ancestors.
 */
export function GlassFill({
  radius = borderRadius.full,
  variant = 'regular',
  interactive = false,
  tint,
}: {
  radius?: number;
  variant?: 'regular' | 'clear';
  interactive?: boolean;
  /** Tints the glass itself (e.g. a faint danger red), keeping it translucent. */
  tint?: string;
}) {
  const { isDark } = useTheme();
  if (!LIQUID_GLASS) return null;
  return (
    <GlassView
      glassEffectStyle={variant}
      colorScheme={isDark ? 'dark' : 'light'}
      isInteractive={interactive}
      // Clear light glass over a white page is invisible; a faint ink tint keeps the card's edge.
      tintColor={tint ?? (isDark ? undefined : 'rgba(0, 0, 0, 0.04)')}
      style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
      pointerEvents="none"
    />
  );
}

/**
 * Glass fill for a bottom sheet: always glass (a sheet floats over real
 * content, so the frosted fallback reads too), top corners rounded, bottom
 * corners square against the screen edge. First child of a sheet with no
 * backgroundColor; same no-opacity rule as CardBackdrop.
 */
export function SheetBackdrop({ radius }: { radius: number }) {
  return (
    <CardSurfaceProvider kind="glass">
      <CardBackdrop
        opaque
        style={{
          borderTopLeftRadius: radius,
          borderTopRightRadius: radius,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
        }}
      />
    </CardSurfaceProvider>
  );
}
