import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { PlanEditScreen } from '../../../src/screens/apex/BillingScreens';

export default function Route() {
  const { key } = useLocalSearchParams<{ key: string }>();
  return (
    <>
      <Stack.Screen options={{ title: key ? key.charAt(0) + key.slice(1).toLowerCase().replace('_', ' ') : 'Plan', headerShown: true }} />
      <PlanEditScreen />
    </>
  );
}
