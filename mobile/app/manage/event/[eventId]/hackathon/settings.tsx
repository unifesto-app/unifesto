import React from 'react';
import { Stack } from 'expo-router';
import HackathonSettingsScreen from '../../../../../src/screens/HackathonSettingsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Sprint settings', headerShown: true }} />
      <HackathonSettingsScreen />
    </>
  );
}
