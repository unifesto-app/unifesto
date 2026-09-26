import React from 'react';
import { Stack } from 'expo-router';
import FinanceScreen from '../../../../src/screens/FinanceScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Finance', headerShown: true }} />
      <FinanceScreen />
    </>
  );
}
