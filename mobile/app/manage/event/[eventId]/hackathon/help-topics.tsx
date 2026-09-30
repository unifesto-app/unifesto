import React from 'react';
import { Stack } from 'expo-router';
import HackathonHelpTopicsScreen from '../../../../../src/screens/HackathonHelpTopicsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Help topics', headerShown: true }} />
      <HackathonHelpTopicsScreen />
    </>
  );
}
