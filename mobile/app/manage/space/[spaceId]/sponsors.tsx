import React from 'react';
import { Stack } from 'expo-router';
import SponsorsScreen from '../../../../src/screens/SponsorsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Sponsors', headerShown: true }} />
      <SponsorsScreen />
    </>
  );
}
