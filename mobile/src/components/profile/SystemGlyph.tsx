import React from 'react';
import type { SFSymbol } from 'expo-symbols';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';

export interface SystemGlyphProps {
  /** The SF Symbol drawn on iOS (SystemGlyph.ios.tsx). */
  sf: SFSymbol;
  /** Its Unicon twin, drawn on Android and web. */
  glyph: GlyphName;
  size: number;
  color: string;
}

/**
 * Android and web: the Unicon twin, filled. expo-symbols isn't imported here on
 * purpose: off iOS its SymbolView bundles and loads the Material Symbols font
 * even when it only renders a fallback.
 */
export default function SystemGlyph({ glyph, size, color }: SystemGlyphProps) {
  return <UnGlyph name={glyph} size={size} color={color} weight="fill" />;
}
