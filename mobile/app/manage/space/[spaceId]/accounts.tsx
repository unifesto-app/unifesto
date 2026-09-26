import React from 'react';
import { Stack } from 'expo-router';
import PayoutAccountsScreen from '../../../../src/screens/PayoutAccountsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Payout accounts', headerShown: true }} />
      <PayoutAccountsScreen />
    </>
  );
}
