import React from 'react';
import { Stack } from 'expo-router';
import HackathonStatementsScreen from '../../../../../src/screens/HackathonStatementsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Problem statements', headerShown: true }} />
      <HackathonStatementsScreen />
    </>
  );
}
