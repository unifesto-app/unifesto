import React from 'react';
import { Stack } from 'expo-router';
import EventWhatsappScreen from '../../../../src/screens/EventWhatsappScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'WhatsApp group', headerShown: true }} />
      <EventWhatsappScreen />
    </>
  );
}
