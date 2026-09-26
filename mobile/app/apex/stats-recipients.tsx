import React from 'react';
import { Stack } from 'expo-router';
import StatsRecipientsScreen from '../../src/screens/apex/StatsRecipientsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Stats recipients', headerShown: true }} />
      <StatsRecipientsScreen />
    </>
  );
}
