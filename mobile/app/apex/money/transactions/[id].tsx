import React from 'react';
import { Stack } from 'expo-router';
import TransactionDetailScreen from '../../../../src/screens/apex/money/TransactionDetailScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Transaction', headerShown: true }} />
      <TransactionDetailScreen />
    </>
  );
}
