import React from 'react';
import { Stack } from 'expo-router';
import PayoutsScreen from '../../../../src/screens/PayoutsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Payouts', headerShown: true }} />
      <PayoutsScreen />
    </>
  );
}
