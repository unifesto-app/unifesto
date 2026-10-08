import React from 'react';
import { Stack } from 'expo-router';
import { SessionAdminDetailScreen } from '../../../src/screens/apex/OpsScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Session', headerShown: true }} />
      <SessionAdminDetailScreen />
    </>
  );
}
