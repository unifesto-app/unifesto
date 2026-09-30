import React from 'react';
import { Stack } from 'expo-router';
import HackathonSubmissionScreen from '../../../src/screens/HackathonSubmissionScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Project links', headerShown: true }} />
      <HackathonSubmissionScreen />
    </>
  );
}
