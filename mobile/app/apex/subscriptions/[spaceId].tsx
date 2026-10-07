import React from 'react';
import { Stack } from 'expo-router';
import { SubscriptionEditScreen } from '../../../src/screens/apex/BillingScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Billing', headerShown: true }} />
      <SubscriptionEditScreen />
    </>
  );
}
