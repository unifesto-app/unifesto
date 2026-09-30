import React from 'react';
import { Stack } from 'expo-router';
import HackathonResultsScreen from '../../../../../src/screens/HackathonResultsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Results', headerShown: true }} />
      <HackathonResultsScreen />
    </>
  );
}
