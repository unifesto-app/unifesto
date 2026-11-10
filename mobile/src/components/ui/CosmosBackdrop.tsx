import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { cosmosFor, useCosmos } from '../../theme/cosmos';

/**
 * The Unifesto Horizon sky, without lines or noise: the owner removed the orbits
 * and the horizon line on 31 Oct 2026, and the stars and film grain on 2 Nov
 * (they read as the old cosmos theme). Behind every screen: the plain ground.
 * `horizon` (default) adds the hero light for the login and splash: the
 * Horizon-blue glow rising from the bottom-right corner, measured in screen
 * widths like the web's cqw units. `hue` lights the page with a colour (the
 * event banner's): a wide nebula fading to the plain ground. Decorative, never
 * touchable.
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

  // Nothing to paint (most screens): skip the Svg. Even empty, it holds a
  // screen-sized bitmap (about 14 MB at 3x) for as long as the screen is mounted.
  if (!hue && !horizon) {
    return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]} />;
  }

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
        {horizon ? <Ellipse cx={w * 0.8} cy={h - w * 0.06} rx={w * 0.5} ry={w * 0.22} fill="url(#sun)" /> : null}
      </Svg>
    </View>
  );
}
