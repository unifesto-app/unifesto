import React from 'react';
import { Stack } from 'expo-router';
import RefundsScreen from '../../../src/screens/apex/money/RefundsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Refunds', headerShown: true }} />
      <RefundsScreen />
    </>
  );
}
