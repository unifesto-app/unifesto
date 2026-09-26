import React from 'react';
import { Stack } from 'expo-router';
import SupportScreen from '../src/screens/SupportScreen';

export default function Support() {
  return (
    <>
      <Stack.Screen options={{ title: 'Support', headerShown: true }} />
      <SupportScreen />
    </>
  );
}
