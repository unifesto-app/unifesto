import React from 'react';
import { Stack } from 'expo-router';
import WhatsappInboxScreen from '../../../src/screens/apex/WhatsappInboxScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'WhatsApp', headerShown: true }} />
      <WhatsappInboxScreen />
    </>
  );
}
