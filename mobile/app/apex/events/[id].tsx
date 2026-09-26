import React from 'react';
import { Stack } from 'expo-router';
import { EventDetailAdminScreen } from '../../../src/screens/apex/LookupDetailScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Event', headerShown: true }} />
      <EventDetailAdminScreen />
    </>
  );
}
