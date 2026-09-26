import React from 'react';
import { Stack } from 'expo-router';
import TicketTypesScreen from '../../../../src/screens/TicketTypesScreen';

export default function ManageTickets() {
  return (
    <>
      <Stack.Screen options={{ title: 'Tickets', headerShown: true }} />
      <TicketTypesScreen mode="tickets" />
    </>
  );
}
