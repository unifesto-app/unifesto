import React from 'react';
import { Stack } from 'expo-router';
import { EventsLookupScreen } from '../../../src/screens/apex/LookupScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Events', headerShown: true }} />
      <EventsLookupScreen />
    </>
  );
}
