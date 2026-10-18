import React from 'react';
import { Stack } from 'expo-router';
import HackathonUpdatesScreen from '../src/screens/HackathonUpdatesScreen';

/** The bell on Home: every in-app notification, not just one event's. */
export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Notifications', headerShown: true }} />
      <HackathonUpdatesScreen />
    </>
  );
}
