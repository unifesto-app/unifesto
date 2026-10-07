import React from 'react';
import { Stack } from 'expo-router';
import { SubscriptionsScreen } from '../../../src/screens/apex/BillingScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Subscriptions', headerShown: true }} />
      <SubscriptionsScreen />
    </>
  );
}
