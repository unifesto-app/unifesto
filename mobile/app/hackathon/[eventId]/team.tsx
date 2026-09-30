import React from 'react';
import { Stack } from 'expo-router';
import HackathonMyTeamScreen from '../../../src/screens/HackathonMyTeamScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Your team', headerShown: true }} />
      <HackathonMyTeamScreen />
    </>
  );
}
