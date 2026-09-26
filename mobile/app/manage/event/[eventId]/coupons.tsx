import React from 'react';
import { Stack } from 'expo-router';
import CouponsScreen from '../../../../src/screens/CouponsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Discount codes', headerShown: true }} />
      <CouponsScreen />
    </>
  );
}
