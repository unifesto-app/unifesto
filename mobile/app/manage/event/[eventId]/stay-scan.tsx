import React from 'react';
import { Stack } from 'expo-router';
import StayScanScreen from '../../../../src/screens/StayScanScreen';

export default function Route() {
  return (
    <>
      {/* The camera is dark in every theme, so the header is always white on it. */}
      <Stack.Screen
        options={{
          title: 'Scan Stay Pass',
          headerShown: true,
          headerTintColor: '#ffffff',
          headerTitleStyle: { color: '#ffffff' },
          contentStyle: { backgroundColor: '#000000' },
        }}
      />
      <StayScanScreen />
    </>
  );
}
