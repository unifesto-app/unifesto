import React from 'react';
import { Stack } from 'expo-router';
import HackathonWinnersScreen from '../../../../../src/screens/HackathonWinnersScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Winners', headerShown: true }} />
      <HackathonWinnersScreen />
    </>
  );
}
