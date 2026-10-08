import React from 'react';
import { Stack } from 'expo-router';
import { LogsScreen } from '../../src/screens/apex/OpsScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Logs', headerShown: true }} />
      <LogsScreen />
    </>
  );
}
