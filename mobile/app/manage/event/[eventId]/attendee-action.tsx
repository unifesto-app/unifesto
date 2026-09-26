import React from 'react';
import { Stack } from 'expo-router';
import AttendeeActionScreen from '../../../../src/screens/AttendeeActionScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Attendee', headerShown: true }} />
      <AttendeeActionScreen />
    </>
  );
}
