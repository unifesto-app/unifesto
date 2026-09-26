import React from 'react';
import { Stack } from 'expo-router';
import WhiteLabelScreen from '../../../../src/screens/WhiteLabelScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Branding', headerShown: true }} />
      <WhiteLabelScreen />
    </>
  );
}
