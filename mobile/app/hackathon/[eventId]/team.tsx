import React from 'react';
import { Stack } from 'expo-router';
import HackathonMyTeamScreen from '../../../src/screens/HackathonMyTeamScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'My team', headerShown: true }} />
      <HackathonMyTeamScreen />
    </>
  );
}
