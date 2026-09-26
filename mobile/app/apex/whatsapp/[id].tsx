import React from 'react';
import { Stack } from 'expo-router';
import WhatsappThreadScreen from '../../../src/screens/apex/WhatsappThreadScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'WhatsApp', headerShown: true }} />
      <WhatsappThreadScreen />
    </>
  );
}
