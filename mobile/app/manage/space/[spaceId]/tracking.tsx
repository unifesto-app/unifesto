import React from 'react';
import { Stack } from 'expo-router';
import SpaceTrackingScreen from '../../../../src/screens/SpaceTrackingScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Tracking', headerShown: true }} />
      <SpaceTrackingScreen />
    </>
  );
}
