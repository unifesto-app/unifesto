import React from 'react';
import { Stack } from 'expo-router';
import AppearanceScreen from '../src/screens/AppearanceScreen';

export default function Appearance() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Appearance',
          headerShown: true,
        }}
      />
      <AppearanceScreen />
    </>
  );
}
