import React from 'react';
import { Stack } from 'expo-router';
import EventsScreen from '../src/screens/EventsScreen';

export default function Events() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Events',
          headerShown: true,
        }}
      />
      <EventsScreen />
    </>
  );
}
