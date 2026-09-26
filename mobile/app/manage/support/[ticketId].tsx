import React from 'react';
import { Stack } from 'expo-router';
import SupportThreadScreen from '../../../src/screens/SupportThreadScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Support', headerShown: true }} />
      <SupportThreadScreen />
    </>
  );
}
