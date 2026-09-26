import React from 'react';
import { Stack } from 'expo-router';
import SpaceSupportScreen from '../../../../src/screens/SpaceSupportScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Support', headerShown: true }} />
      <SpaceSupportScreen />
    </>
  );
}
