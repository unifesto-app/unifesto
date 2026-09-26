import React from 'react';
import { View, DimensionValue } from 'react-native';
import { Image } from 'expo-image';

interface UnifestoAppWordmarkProps {
  width?: DimensionValue;
  height?: DimensionValue;
}

export default function UnifestoAppWordmark({ width = 122, height = 40 }: UnifestoAppWordmarkProps) {
  return (
    <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
      <Image
        source={require('../../assets/UnifestoAppWordmark.png')}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
      />
    </View>
  );
}
