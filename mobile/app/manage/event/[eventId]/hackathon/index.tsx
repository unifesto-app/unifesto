import React from 'react';
import { Stack } from 'expo-router';
import HackathonManageScreen from '../../../../../src/screens/HackathonManageScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Unifesto Sprint', headerShown: true }} />
      <HackathonManageScreen />
    </>
  );
}
