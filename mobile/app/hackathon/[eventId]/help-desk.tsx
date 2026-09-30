import React from 'react';
import { Stack } from 'expo-router';
import HackathonHelpDeskScreen from '../../../src/screens/HackathonHelpDeskScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Help desk', headerShown: true }} />
      <HackathonHelpDeskScreen />
    </>
  );
}
