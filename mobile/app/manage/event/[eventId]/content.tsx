import React from 'react';
import { Stack } from 'expo-router';
import EventContentScreen from '../../../../src/screens/EventContentScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Event content', headerShown: true }} />
      <EventContentScreen />
    </>
  );
}
