import React from 'react';
import { Stack } from 'expo-router';
import ImportAttendeesScreen from '../../../../src/screens/ImportAttendeesScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Import from CSV', headerShown: true }} />
      <ImportAttendeesScreen />
    </>
  );
}
