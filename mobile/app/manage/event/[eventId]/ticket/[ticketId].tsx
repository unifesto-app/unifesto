import React from 'react';
import { Stack } from 'expo-router';
import TicketEditorScreen from '../../../../../src/screens/TicketEditorScreen';

// ticketId === 'new' creates (kind comes from the route param); otherwise edits.
// The screen sets its own title once it knows which.
export default function TicketEditor() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true }} />
      <TicketEditorScreen />
    </>
  );
}
