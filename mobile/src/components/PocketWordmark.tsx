import React from 'react';
import { View, DimensionValue } from 'react-native';
import { Image } from 'expo-image';

interface PocketWordmarkProps {
  width?: DimensionValue;
  height?: DimensionValue;
}

export default function PocketWordmark({ width = 120, height = 34 }: PocketWordmarkProps) {
  return (
    <View style={{ width, height, justifyContent: 'center', alignItems: 'center' }}>
      <Image
        source={require('../../assets/PocketWordmark.png')}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
      />
    </View>
  );
}
