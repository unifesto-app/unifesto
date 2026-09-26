import React from 'react';
import { Stack } from 'expo-router';
import SpaceSettingsScreen from '../../../../src/screens/SpaceSettingsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Space settings', headerShown: true }} />
      <SpaceSettingsScreen />
    </>
  );
}
