import React from 'react';
import { Stack } from 'expo-router';
import HackathonTeamsScreen from '../../../../../src/screens/HackathonTeamsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Teams', headerShown: true }} />
      <HackathonTeamsScreen />
    </>
  );
}
