import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTokens } from '../../context/ThemeContext';

/**
 * Quiet brand glow that sits behind the auth and home screens: one soft blue bloom
 * from the top edge, fading to the canvas. Purely decorative, never touchable.
 */
export default function BrandGlow() {
  const tokens = useTokens();
  const { width } = useWindowDimensions();
  const height = Math.round(width * 1.1);
  // Blue on white reads far stronger than blue on black, so light mode gets a
  // softer bloom.
  const [core, mid] = tokens.scheme === 'dark' ? [0.32, 0.1] : [0.14, 0.04];

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id="bloom" cx="75%" cy="0%" rx="85%" ry="75%" fx="75%" fy="0%">
            <Stop offset="0" stopColor={tokens.accent} stopOpacity={core} />
            <Stop offset="0.45" stopColor={tokens.accentStrong} stopOpacity={mid} />
            <Stop offset="1" stopColor={tokens.bg} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="url(#bloom)" />
      </Svg>
    </View>
  );
}
