import React from 'react';
import { View, DimensionValue } from 'react-native';
import { Image } from 'expo-image';

interface UnifestoAppWordmarkProps {
  width?: DimensionValue;
  height?: DimensionValue;
}

/**
 * The 2026 wordmark in silver, fitted into a fixed box, for surfaces that are
 * always night whatever the app theme (the share card). Themed screens use
 * BrandWordmark, which turns ink by day.
 */
export default function UnifestoAppWordmark({ width = 122, height = 40 }: UnifestoAppWordmarkProps) {
  return (
    <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
      <Image
        source={require('../../assets/brand/wordmark-silver.png')}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        accessibilityLabel="Unifesto"
      />
    </View>
  );
}
