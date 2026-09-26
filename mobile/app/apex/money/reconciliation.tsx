import React from 'react';
import { Stack } from 'expo-router';
import ReconciliationScreen from '../../../src/screens/apex/money/ReconciliationScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Reconciliation', headerShown: true }} />
      <ReconciliationScreen />
    </>
  );
}
