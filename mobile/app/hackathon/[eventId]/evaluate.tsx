import React from 'react';
import { Stack } from 'expo-router';
import HackathonEvaluateScreen from '../../../src/screens/HackathonEvaluateScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Judging', headerShown: true }} />
      <HackathonEvaluateScreen />
    </>
  );
}
