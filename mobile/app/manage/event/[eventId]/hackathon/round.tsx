import React from 'react';
import { Stack } from 'expo-router';
import HackathonRoundScreen from '../../../../../src/screens/HackathonRoundScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Round', headerShown: true }} />
      <HackathonRoundScreen />
    </>
  );
}
