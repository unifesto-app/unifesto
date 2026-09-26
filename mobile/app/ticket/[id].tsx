import React from 'react';
import { Stack } from 'expo-router';
import TicketDetailScreen from '../../src/screens/TicketDetailScreen';

// The screen reads the ticket from the route params and owns its header
// actions (share "I'm going", calendar, view event, report).
export default function TicketDetail() {
  return (
    <>
      <Stack.Screen options={{ title: 'My ticket', headerShown: true }} />
      <TicketDetailScreen />
    </>
  );
}
