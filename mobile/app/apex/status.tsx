import React from 'react';
import { Stack } from 'expo-router';
import PlatformStatusScreen from '../../src/screens/apex/PlatformStatusScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Status', headerShown: true }} />
      <PlatformStatusScreen />
    </>
  );
}
