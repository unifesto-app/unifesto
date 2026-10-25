import React from 'react';
import { Stack } from 'expo-router';
import EventDayScreen from '../../../../src/screens/EventDayScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Event day', headerShown: true }} />
      <EventDayScreen />
    </>
  );
}
