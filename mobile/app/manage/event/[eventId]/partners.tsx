import React from 'react';
import { Stack } from 'expo-router';
import EventPartnersScreen from '../../../../src/screens/EventPartnersScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Partners', headerShown: true }} />
      <EventPartnersScreen />
    </>
  );
}
