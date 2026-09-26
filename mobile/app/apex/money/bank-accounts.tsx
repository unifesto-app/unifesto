import React from 'react';
import { Stack } from 'expo-router';
import BankAccountsScreen from '../../../src/screens/apex/money/BankAccountsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Payout accounts', headerShown: true }} />
      <BankAccountsScreen />
    </>
  );
}
