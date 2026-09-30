import React from 'react';
import { Stack } from 'expo-router';
import HackathonUpdatesScreen from '../../../src/screens/HackathonUpdatesScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Updates', headerShown: true }} />
      <HackathonUpdatesScreen />
    </>
  );
}
