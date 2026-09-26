import React from 'react';
import { Stack } from 'expo-router';
import BillingScreen from '../../../../src/screens/BillingScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Plan and billing', headerShown: true }} />
      <BillingScreen />
    </>
  );
}
