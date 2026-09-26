import React from 'react';
import { Stack } from 'expo-router';
import TicketQuestionScreen from '../../../../src/screens/TicketQuestionScreen';

// Params: ticketId, fieldId ('new' creates), group ('1' for group tickets).
export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Question', headerShown: true }} />
      <TicketQuestionScreen />
    </>
  );
}
