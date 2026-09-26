import React from 'react';
import { Stack } from 'expo-router';
import EventSponsorsScreen from '../../../../src/screens/EventSponsorsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Sponsors', headerShown: true }} />
      <EventSponsorsScreen />
    </>
  );
}
