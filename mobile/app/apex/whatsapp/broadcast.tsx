import React from 'react';
import { Stack } from 'expo-router';
import WhatsappBroadcastScreen from '../../../src/screens/apex/WhatsappBroadcastScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'WhatsApp blast', headerShown: true }} />
      <WhatsappBroadcastScreen />
    </>
  );
}
