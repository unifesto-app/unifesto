import React from 'react';
import { Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { cosmosFor, useCosmos } from '../../theme/cosmos';

// Star field lifted from the app icon (marketing/brand-2026/svg/app-icon-dark.svg),
// as fractions of the screen: [x, y, radius, opacity]. Night only.
const STARS: [number, number, number, number][] = [
  [0.18, 0.1, 1.4, 0.75],
  [0.82, 0.07, 1.2, 0.6],
  [0.9, 0.24, 1, 0.45],
  [0.12, 0.36, 1, 0.4],
  [0.7, 0.05, 0.9, 0.5],
  [0.31, 0.06, 0.8, 0.4],
  [0.6, 0.14, 0.8, 0.3],
  [0.86, 0.5, 0.9, 0.3],
  [0.05, 0.6, 0.8, 0.25],
];

const GRAIN = require('../../../assets/brand/grain-180.png');
const GRAIN_INK = require('../../../assets/brand/grain-180-ink.png');

/**
 * The Unifesto Horizon sky (marketing/brand-2026/horizon-sky.html), measured in
 * screen widths like the web's cqw units. Behind every screen: starlight by
 * night, two white orbit hairlines (a circle from the top right, an ellipse
 * rising from the bottom left) and film grain. `horizon` (default) adds the hero
 * layer for the login and splash: the horizon line and its bloom, the
 * Horizon-blue glow rising from the bottom-right corner, and the edge rules.
 * `hue` lights the page with a colour (the event banner's): a wide nebula behind
 * the stars, fading to the plain ground. Decorative, never touchable.
 */
export default function CosmosBackdrop({
  horizon = true,
  scheme,
  hue,
}: {
  horizon?: boolean;
  hue?: string | null;
  /** Override the app theme (the splash follows the OS instead). */
  scheme?: 'dark' | 'light';
}) {
  const appCosmos = useCosmos();
  const c = scheme ? cosmosFor(scheme) : appCosmos;
  const { width: w, height: h } = useWindowDimensions();
  const isDark = c.scheme === 'dark';
  const line = `rgb(${c.glow})`;
  const bloom = `rgb(${c.bloom})`;
  const sun = isDark ? 0.32 : 0.5;
  // Where the planet's rim used to sit, so the login and splash keep their composition.
  const y = Math.round(h * 0.82);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}>
      <Svg width={w} height={h}>
        <Defs>
          {hue ? (
            <RadialGradient id="nebula" cx="50%" cy="50%" rx="50%" ry="50%">
              <Stop offset="0" stopColor={hue} stopOpacity={isDark ? 0.42 : 0.22} />
              <Stop offset="0.55" stopColor={hue} stopOpacity={isDark ? 0.14 : 0.08} />
              <Stop offset="1" stopColor={hue} stopOpacity={0} />
            </RadialGradient>
          ) : null}
          <RadialGradient id="sun" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={c.horizon} stopOpacity={sun} />
            <Stop offset="0.5" stopColor={c.horizon} stopOpacity={sun * 0.44} />
            <Stop offset="1" stopColor={c.horizon} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="line" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={bloom} stopOpacity={0} />
            <Stop offset="0.25" stopColor={bloom} stopOpacity={0.18} />
            <Stop offset="0.5" stopColor={bloom} stopOpacity={0.6} />
            <Stop offset="0.75" stopColor={bloom} stopOpacity={0.18} />
            <Stop offset="1" stopColor={bloom} stopOpacity={0} />
          </LinearGradient>
          <RadialGradient id="bloom" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor={bloom} stopOpacity={0.1} />
            <Stop offset="0.7" stopColor={bloom} stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {hue ? <Ellipse cx={w * 0.5} cy={h * 0.12} rx={w * 1.3} ry={h * 0.55} fill="url(#nebula)" /> : null}
        {isDark &&
          STARS.map(([x, sy, r, o], i) => <Circle key={i} cx={x * w} cy={sy * h} r={r} fill="#ffffff" opacity={o} />)}
        {horizon ? <Ellipse cx={w * 0.8} cy={h - w * 0.06} rx={w * 0.5} ry={w * 0.22} fill="url(#sun)" /> : null}

        <Circle cx={w * 0.91} cy={-w * 0.13} r={w * 0.75} fill="none" stroke={line} strokeOpacity={0.09} strokeWidth={1} />
        <Ellipse cx={w * 0.3} cy={h + w * 0.36} rx={w * 0.9} ry={w * 0.6} fill="none" stroke={line} strokeOpacity={0.09} strokeWidth={1} />

        {horizon ? (
          <>
            <Rect x={w * 0.025} y={0} width={1} height={h} fill={line} opacity={0.06} />
            <Rect x={w * 0.975 - 1} y={0} width={1} height={h} fill={line} opacity={0.06} />
            <Ellipse cx={w * 0.5} cy={y} rx={w * 0.4} ry={100} fill="url(#bloom)" />
            <Rect x={0} y={y} width={w} height={1} fill="url(#line)" />
          </>
        ) : null}
      </Svg>
      {/* Film grain, as on the site: 12% by night, 9% (ink) by day. */}
      <Image
        source={isDark ? GRAIN : GRAIN_INK}
        resizeMode="repeat"
        style={[StyleSheet.absoluteFill, { opacity: isDark ? 0.12 : 0.09 }]}
      />
    </View>
  );
}
