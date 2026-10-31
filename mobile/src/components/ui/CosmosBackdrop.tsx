import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import Grain from './Grain';
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

/**
 * The Unifesto Horizon sky, without lines (the owner removed the orbits and the
 * horizon line from the app on 31 Oct 2026). Behind every screen: starlight by
 * night and film grain. `horizon` (default) adds the hero light for the login
 * and splash: the Horizon-blue glow rising from the bottom-right corner,
 * measured in screen widths like the web's cqw units. `hue` lights the page
 * with a colour (the event banner's): a wide nebula behind the stars, fading to
 * the plain ground. Decorative, never touchable.
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
  const sun = isDark ? 0.32 : 0.5;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, overflow: 'hidden' }]}>
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
        </Defs>

        {hue ? <Ellipse cx={w * 0.5} cy={h * 0.12} rx={w * 1.3} ry={h * 0.55} fill="url(#nebula)" /> : null}
        {isDark &&
          STARS.map(([x, sy, r, o], i) => <Circle key={i} cx={x * w} cy={sy * h} r={r} fill="#ffffff" opacity={o} />)}
        {horizon ? <Ellipse cx={w * 0.8} cy={h - w * 0.06} rx={w * 0.5} ry={w * 0.22} fill="url(#sun)" /> : null}
      </Svg>
      {/* Film grain, as on the site: 12% by night, 9% (ink) by day. */}
      <Grain dark={isDark} opacity={isDark ? 0.12 : 0.09} />
    </View>
  );
}
