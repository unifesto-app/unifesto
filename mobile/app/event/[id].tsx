import React from 'react';
import { Stack } from 'expo-router';
import EventDetailScreen from '../../src/screens/EventDetailScreen';

// The screen owns its header actions (save + menu), since it already has the
// event loaded — no second fetch here.
export default function EventDetail() {
  return (
    <>
      <Stack.Screen options={{ title: 'Event details', headerShown: true }} />
      <EventDetailScreen />
    </>
  );
}
