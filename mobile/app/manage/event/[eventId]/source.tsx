import React from 'react';
import { Stack } from 'expo-router';
import SourceAttendeesScreen from '../../../../src/screens/SourceAttendeesScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'From this source', headerShown: true }} />
      <SourceAttendeesScreen />
    </>
  );
}
