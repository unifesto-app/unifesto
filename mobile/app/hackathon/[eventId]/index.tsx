import React from 'react';
import { Stack } from 'expo-router';
import HackathonHubScreen from '../../../src/screens/HackathonHubScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Hackathon', headerShown: true }} />
      <HackathonHubScreen />
    </>
  );
}
