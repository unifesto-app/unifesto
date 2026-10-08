import React from 'react';
import { Stack } from 'expo-router';
import { PlansScreen } from '../../../src/screens/apex/BillingScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Plans', headerShown: true }} />
      <PlansScreen />
    </>
  );
}
