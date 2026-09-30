import React from 'react';
import { Stack } from 'expo-router';
import HackathonStatementScreen from '../../../src/screens/HackathonStatementScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Problem statement', headerShown: true }} />
      <HackathonStatementScreen />
    </>
  );
}
