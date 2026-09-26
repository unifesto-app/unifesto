import React from 'react';
import { Stack } from 'expo-router';
import EventAttendeesScreen from '../../../../src/screens/EventAttendeesScreen';

export default function EventAttendees() {
  return (
    <>
      <Stack.Screen options={{ title: 'Attendees', headerShown: true }} />
      <EventAttendeesScreen />
    </>
  );
}
