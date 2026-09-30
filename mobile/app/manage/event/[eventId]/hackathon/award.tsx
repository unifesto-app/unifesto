import React from 'react';
import { Stack } from 'expo-router';
import HackathonAwardEditorScreen from '../../../../../src/screens/HackathonAwardEditorScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Award', headerShown: true }} />
      <HackathonAwardEditorScreen />
    </>
  );
}
