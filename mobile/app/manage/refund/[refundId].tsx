import React from 'react';
import { Stack } from 'expo-router';
import RefundDetailScreen from '../../../src/screens/RefundDetailScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Refund request', headerShown: true }} />
      <RefundDetailScreen />
    </>
  );
}
