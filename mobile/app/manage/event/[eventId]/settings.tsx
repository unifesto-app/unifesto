import React from 'react';
import { Stack } from 'expo-router';
import EventSettingsScreen from '../../../../src/screens/EventSettingsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Event settings', headerShown: true }} />
      <EventSettingsScreen />
    </>
  );
}
