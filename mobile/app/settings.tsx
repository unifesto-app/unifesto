import React from 'react';
import { Stack } from 'expo-router';
import SettingsScreen from '../src/screens/SettingsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Settings', headerShown: true }} />
      <SettingsScreen />
    </>
  );
}
