import React from 'react';
import { Image } from 'expo-image';
import { useCosmos } from '../theme/cosmos';

// Brand wordmark PNG is 2400×551.
const RATIO = 551 / 2400;

/** The 2026 wordmark: silver on dark, ink on light. */
export default function BrandWordmark({ width }: { width: number }) {
  const c = useCosmos();
  return (
    <Image
      source={c.scheme === 'dark' ? require('../../assets/brand/wordmark-silver.png') : require('../../assets/brand/wordmark-ink.png')}
      style={{ width, height: Math.round(width * RATIO) }}
      contentFit="contain"
      accessibilityLabel="Unifesto"
    />
  );
}
