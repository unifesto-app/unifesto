import React from 'react';
import { Stack } from 'expo-router';
import { SessionsAdminScreen } from '../../../src/screens/apex/OpsScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Sessions', headerShown: true }} />
      <SessionsAdminScreen />
    </>
  );
}
