import React from 'react';
import { Stack } from 'expo-router';
import RequestPayoutScreen from '../../../../src/screens/RequestPayoutScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Request payout', headerShown: true }} />
      <RequestPayoutScreen />
    </>
  );
}
