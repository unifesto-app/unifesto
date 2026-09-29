import React from 'react';
import { Stack } from 'expo-router';
import StayOptionEditorScreen from '../../../../src/screens/StayOptionEditorScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Option', headerShown: true }} />
      <StayOptionEditorScreen />
    </>
  );
}
