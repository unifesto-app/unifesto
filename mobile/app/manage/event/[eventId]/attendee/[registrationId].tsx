import React from 'react';
import { Stack } from 'expo-router';
import AttendeeDetailScreen from '../../../../../src/screens/AttendeeDetailScreen';

export default function AttendeeDetail() {
  return (
    <>
      <Stack.Screen options={{ title: 'Attendee', headerShown: true }} />
      <AttendeeDetailScreen />
    </>
  );
}
