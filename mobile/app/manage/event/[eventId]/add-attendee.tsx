import React from 'react';
import { Stack } from 'expo-router';
import AddAttendeeScreen from '../../../../src/screens/AddAttendeeScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Add attendee', headerShown: true }} />
      <AddAttendeeScreen />
    </>
  );
}
