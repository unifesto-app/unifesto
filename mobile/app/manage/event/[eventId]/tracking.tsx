import React from 'react';
import { Stack } from 'expo-router';
import EventTrackingScreen from '../../../../src/screens/EventTrackingScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Tracking', headerShown: true }} />
      <EventTrackingScreen />
    </>
  );
}
