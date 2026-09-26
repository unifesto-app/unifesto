import React from 'react';
import { Stack } from 'expo-router';
import NewSupportTicketScreen from '../../../src/screens/NewSupportTicketScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'New request', headerShown: true }} />
      <NewSupportTicketScreen />
    </>
  );
}
