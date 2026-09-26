import React from 'react';
import { Stack } from 'expo-router';
import AdminPayoutDetailScreen from '../../../src/screens/apex/AdminPayoutDetailScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Payout', headerShown: true }} />
      <AdminPayoutDetailScreen />
    </>
  );
}
