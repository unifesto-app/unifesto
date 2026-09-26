import React from 'react';
import { Stack } from 'expo-router';
import AddPayoutAccountScreen from '../../src/screens/AddPayoutAccountScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Add bank account', headerShown: true }} />
      <AddPayoutAccountScreen />
    </>
  );
}
