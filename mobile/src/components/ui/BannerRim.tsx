import React, { useId, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTokens } from '../../context/ThemeContext';

export type Corner = 'tl' | 'tr' | 'bl' | 'br';

type Props = {
  /** Match the banner container's corner radius. */
  radius: number;
  /**
   * The page background colour behind the banner, when it has one (e.g. the
   * banner-palette wash). Without it the light is a soft glass edge that
   * contrasts the theme: light on dark, dark on light.
   */
  color?: string;
  corners?: Corner[];
  strokeWidth?: number;
  /** Brightness at the corner itself (fades to 0 along the edges). */
  intensity?: number;
};

/**
 * Light caught on an event / space banner's border at a few corners: the same
 * rounded-rect stroke drawn once per corner, each painted with a radial
 * gradient that is bright at that corner and fades to nothing along both
 * edges. Drop it as the last child of the banner container; it fills it and
 * sizes itself.
 */
export default function BannerRim({
  radius,
  color,
  corners = ['tl', 'tr', 'br'],
  strokeWidth = 1.5,
  intensity,
}: Props) {
  const tokens = useTokens();
  // Unique gradient ids per instance so rims on one screen never share defs.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const stroke = color ?? tokens.text;
  const peak = intensity ?? (color ? 0.95 : 0.6);

  const inset = strokeWidth / 2;
  const svg =
    size && size.w > 0 && size.h > 0 ? (
      <Svg width={size.w} height={size.h}>
        <Defs>
          {corners.map((c) => (
            <RadialGradient
              key={c}
              id={`rim-${uid}-${c}`}
              gradientUnits="userSpaceOnUse"
              cx={c.endsWith('l') ? 0 : size.w}
              cy={c.startsWith('t') ? 0 : size.h}
              r={Math.min(size.w, size.h) * 0.6} // how far the light runs along each edge
            >
              <Stop offset="0" stopColor={stroke} stopOpacity={peak} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {corners.map((c) => (
          <Rect
            key={c}
            x={inset}
            y={inset}
            width={size.w - strokeWidth}
            height={size.h - strokeWidth}
            rx={Math.max(0, radius - inset)}
            fill="none"
            stroke={`url(#rim-${uid}-${c})`}
            strokeWidth={strokeWidth}
          />
        ))}
      </Svg>
    ) : null;

  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        if (!size || size.w !== w || size.h !== h) setSize({ w, h });
      }}
    >
      {svg}
    </View>
  );
}
