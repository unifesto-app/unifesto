import React from 'react';
import { Stack } from 'expo-router';
import FinancialsScreen from '../../../src/screens/apex/money/FinancialsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Financials', headerShown: true }} />
      <FinancialsScreen />
    </>
  );
}
