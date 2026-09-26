import React from 'react';
import { Stack } from 'expo-router';
import TicketTypesScreen from '../../../../src/screens/TicketTypesScreen';

export default function ManageRsvps() {
  return (
    <>
      <Stack.Screen options={{ title: 'RSVPs', headerShown: true }} />
      <TicketTypesScreen mode="rsvps" />
    </>
  );
}
