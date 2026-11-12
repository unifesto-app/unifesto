import React from 'react';
import { SymbolView } from 'expo-symbols';
import type { SystemGlyphProps } from './SystemGlyph';

/** iOS: the real SF Symbol (ExpoSymbols is already in the binary through expo-router). */
export default function SystemGlyph({ sf, size, color }: SystemGlyphProps) {
  return <SymbolView name={sf} size={size} tintColor={color} weight="medium" />;
}
