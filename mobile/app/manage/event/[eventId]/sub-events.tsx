import React from 'react';
import { Stack } from 'expo-router';
import SubEventsScreen from '../../../../src/screens/SubEventsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Sub-events', headerShown: true }} />
      <SubEventsScreen />
    </>
  );
}
