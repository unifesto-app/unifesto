import React from 'react';
import { Stack } from 'expo-router';
import HackathonRoundsScreen from '../../../../../src/screens/HackathonRoundsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Rounds', headerShown: true }} />
      <HackathonRoundsScreen />
    </>
  );
}
