import React from 'react';
import { Stack } from 'expo-router';
import OrphanedPaymentsScreen from '../../../src/screens/apex/money/OrphanedPaymentsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Orphaned payments', headerShown: true }} />
      <OrphanedPaymentsScreen />
    </>
  );
}
