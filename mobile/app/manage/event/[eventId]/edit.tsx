import React from 'react';
import { Stack } from 'expo-router';
import EventFormScreen from '../../../../src/screens/EventFormScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Edit event', headerShown: true }} />
      <EventFormScreen />
    </>
  );
}
