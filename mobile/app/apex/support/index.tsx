import React from 'react';
import { Stack } from 'expo-router';
import SupportInboxScreen from '../../../src/screens/apex/SupportInboxScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Support', headerShown: true }} />
      <SupportInboxScreen />
    </>
  );
}
