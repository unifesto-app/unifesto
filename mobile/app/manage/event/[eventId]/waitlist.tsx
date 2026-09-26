import React from 'react';
import { Stack } from 'expo-router';
import WaitlistScreen from '../../../../src/screens/WaitlistScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Waiting list', headerShown: true }} />
      <WaitlistScreen />
    </>
  );
}
