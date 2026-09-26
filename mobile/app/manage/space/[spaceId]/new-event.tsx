import React from 'react';
import { Stack } from 'expo-router';
import EventFormScreen from '../../../../src/screens/EventFormScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'New event', headerShown: true }} />
      <EventFormScreen />
    </>
  );
}
