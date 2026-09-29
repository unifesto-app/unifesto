import React from 'react';
import { Stack } from 'expo-router';
import StayBrowseScreen from '../../src/screens/StayBrowseScreen';

// Unifesto Stay: the stays an event offers, for attendees.
export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Unifesto Stay', headerShown: true }} />
      <StayBrowseScreen />
    </>
  );
}
