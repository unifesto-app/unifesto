import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { cosmosFor, useCosmos } from '../../theme/cosmos';

// Star field lifted from the app icon (marketing/brand-2026/svg/app-icon-dark.svg),
// as fractions of the screen: [x, y, radius, opacity].
/** How far the horizon glow reaches above the rim. */
const GLOW = 28;

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
 * The brand's night sky behind the login flow: scattered starlight, a soft halo
 * up top, and a planet horizon with a silver rim along the bottom. Light mode
 * keeps only the horizon, drawn in ink. Decorative, never touchable.
 * `horizon={false}` keeps just the sky, for scrolling screens like Home.
 */
export default function CosmosBackdrop({
  horizon = true,
  scheme,
}: {
  horizon?: boolean;
  /** Override the app theme (the splash follows the OS instead). */
  scheme?: 'dark' | 'light';
}) {
  const appCosmos = useCosmos();
  const c = scheme ? cosmosFor(scheme) : appCosmos;
  const { width, height } = useWindowDimensions();
  const isDark = c.scheme === 'dark';

  // A huge circle whose top edge peeks ~18% up from the bottom of the screen.
  const r = width * 1.6;
  const cy = height * 0.82 + r;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="halo" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={isDark ? 0.09 : 0} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </RadialGradient>
          {/* Centred on the planet, so the glow follows the curve: clear inside the
              rim, brightest at it, fading out GLOW pt above. */}
          <RadialGradient id="rimGlow" cx={width * 0.5} cy={cy} r={r + GLOW} gradientUnits="userSpaceOnUse">
            <Stop offset={r / (r + GLOW)} stopColor={`rgb(${c.glow})`} stopOpacity={isDark ? 0.16 : 0.06} />
            <Stop offset="1" stopColor={`rgb(${c.glow})`} stopOpacity={0} />
          </RadialGradient>
          <LinearGradient id="planet" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={isDark ? '#1c1c20' : '#f4f4f5'} />
            <Stop offset="0.08" stopColor={c.bg} />
          </LinearGradient>
        </Defs>

        <Ellipse cx={width * 0.5} cy={height * 0.18} rx={width * 0.9} ry={height * 0.28} fill="url(#halo)" />
        {isDark &&
          STARS.map(([x, y, sr, o], i) => (
            <Circle key={i} cx={x * width} cy={y * height} r={sr} fill="#ffffff" opacity={o} />
          ))}
        {horizon && (
          <>
            <Circle cx={width * 0.5} cy={cy} r={r + GLOW} fill="url(#rimGlow)" />
            <Circle
              cx={width * 0.5}
              cy={cy}
              r={r}
              fill="url(#planet)"
              stroke={`rgb(${c.glow})`}
              strokeOpacity={isDark ? 0.42 : 0.18}
              strokeWidth={1.25}
            />
          </>
        )}
      </Svg>
    </View>
  );
}
