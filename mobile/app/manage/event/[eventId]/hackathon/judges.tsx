import React from 'react';
import { Stack } from 'expo-router';
import HackathonJudgesScreen from '../../../../../src/screens/HackathonJudgesScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Judges', headerShown: true }} />
      <HackathonJudgesScreen />
    </>
  );
}
