import React from 'react';
import { Image, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { spacing } from '../../theme/spacing';
import { SHADES, cosmosCardRadius, useCosmos, type ShadeTone } from '../../theme/cosmos';

const GRAIN = require('../../../assets/brand/grain-180.png');
const GRAIN_INK = require('../../../assets/brand/grain-180-ink.png');

/**
 * A Horizon shade card (guidelines §08): soft shapes in one accent, blended into
 * a deep base, grain on top. Sky = two orbs (tickets), mint = a horizon rising
 * from below (the door, check-in), ivory = a diagonal beam (money), blue = a fan
 * of light from a corner (hackathons, the Space). No lines, no edges, no border.
 * At most one per screen, for its hero card; everything else is a plain card.
 * Content sits straight on the shade (glass stays on floating chrome only).
 */
export default function ShadeCard({
  tone,
  onPress,
  accessibilityLabel,
  style,
  children,
}: {
  tone: ShadeTone;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const c = useCosmos();
  const isDark = c.scheme === 'dark';
  const { s1, s2, s3 } = SHADES[c.scheme][tone];
  // Blue is held back, as on the site.
  const opacity = tone === 'blue' ? (isDark ? 0.45 : 0.7) : isDark ? 0.7 : 0.85;

  const fill = (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: s3 }]}>
      {/* The site's shapes layer is inset -15% and blurred; its coordinates are
          0..100 here, and the viewBox crops it back to the card. */}
      <Svg width="100%" height="100%" viewBox="11.5 11.5 77 77" preserveAspectRatio="none" opacity={opacity}>
        <Defs>
          <RadialGradient id="a" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={s1} stopOpacity={1} />
            <Stop offset="0.72" stopColor={s1} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="b" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={s2} stopOpacity={1} />
            <Stop offset="0.72" stopColor={s2} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="beam" x1="0.09" y1="0.21" x2="0.91" y2="0.79">
            <Stop offset="0.22" stopColor={s1} stopOpacity={0} />
            <Stop offset="0.48" stopColor={s1} stopOpacity={1} />
            <Stop offset="0.74" stopColor={s1} stopOpacity={0} />
          </LinearGradient>
          {/* The fan: brightest at the corner it rises from. */}
          <RadialGradient id="fan" cx="50%" cy="50%" rx="50%" ry="50%" fx="92%" fy="50%">
            <Stop offset="0" stopColor={s1} stopOpacity={1} />
            <Stop offset="0.45" stopColor={s2} stopOpacity={0.8} />
            <Stop offset="1" stopColor={s2} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {tone === 'sky' ? (
          <>
            <Ellipse cx={80} cy={22} rx={42} ry={42} fill="url(#a)" />
            <Ellipse cx={22} cy={80} rx={40} ry={40} fill="url(#b)" />
          </>
        ) : tone === 'mint' ? (
          <>
            <Ellipse cx={50} cy={100} rx={85} ry={38} fill="url(#a)" />
            <Ellipse cx={18} cy={22} rx={30} ry={30} fill="url(#b)" />
          </>
        ) : tone === 'ivory' ? (
          <>
            <Rect x={0} y={0} width={100} height={100} fill="url(#beam)" />
            <Ellipse cx={86} cy={86} rx={34} ry={34} fill="url(#b)" />
          </>
        ) : (
          <>
            <Ellipse cx={58} cy={78} rx={38} ry={22} fill="url(#fan)" transform="rotate(23 58 78)" />
            <Ellipse cx={18} cy={18} rx={26} ry={26} fill="url(#b)" />
          </>
        )}
      </Svg>
      {/* Heavier grain than the page. */}
      <Image
        source={isDark ? GRAIN : GRAIN_INK}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFill, { opacity: isDark ? 0.2 : 0.14 }]}
      />
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [styles.card, style, { transform: [{ scale: pressed ? 0.985 : 1 }] }]}
      >
        {fill}
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[styles.card, style]} accessibilityLabel={accessibilityLabel}>
      {fill}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden', padding: spacing[5] },
});
