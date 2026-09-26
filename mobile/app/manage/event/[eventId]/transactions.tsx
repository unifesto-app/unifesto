import React from 'react';
import { Stack } from 'expo-router';
import TransactionsScreen from '../../../../src/screens/TransactionsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Transactions', headerShown: true }} />
      <TransactionsScreen />
    </>
  );
}
