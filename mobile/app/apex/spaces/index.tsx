import React from 'react';
import { Stack } from 'expo-router';
import { SpacesLookupScreen } from '../../../src/screens/apex/LookupScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Spaces', headerShown: true }} />
      <SpacesLookupScreen />
    </>
  );
}
