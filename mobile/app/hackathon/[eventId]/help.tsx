import React from 'react';
import { Stack } from 'expo-router';
import HackathonHelpScreen from '../../../src/screens/HackathonHelpScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Get help', headerShown: true }} />
      <HackathonHelpScreen />
    </>
  );
}
