import React from 'react';
import { Stack } from 'expo-router';
import HackathonPanelEditorScreen from '../../../../../src/screens/HackathonPanelEditorScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Panel', headerShown: true }} />
      <HackathonPanelEditorScreen />
    </>
  );
}
