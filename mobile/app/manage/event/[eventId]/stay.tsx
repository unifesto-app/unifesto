import React from 'react';
import { Stack } from 'expo-router';
import StayEditorScreen from '../../../../src/screens/StayEditorScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Unifesto Stay', headerShown: true }} />
      <StayEditorScreen />
    </>
  );
}
