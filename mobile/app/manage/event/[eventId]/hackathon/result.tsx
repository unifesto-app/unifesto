import React from 'react';
import { Stack } from 'expo-router';
import HackathonResultTeamScreen from '../../../../../src/screens/HackathonResultTeamScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Results', headerShown: true }} />
      <HackathonResultTeamScreen />
    </>
  );
}
