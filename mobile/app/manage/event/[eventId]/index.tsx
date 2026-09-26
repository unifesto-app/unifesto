import React from 'react';
import { Stack } from 'expo-router';
import ManageEventScreen from '../../../../src/screens/ManageEventScreen';

// Operator hub for one event, pushed from Manage space.
export default function ManageEvent() {
  return (
    <>
      <Stack.Screen options={{ title: 'Manage event', headerShown: true }} />
      <ManageEventScreen />
    </>
  );
}
