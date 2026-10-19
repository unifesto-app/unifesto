import React from 'react';
import { Stack } from 'expo-router';
import AssistStartScreen from '../../../src/screens/AssistStartScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Get help', headerShown: true }} />
      <AssistStartScreen />
    </>
  );
}
