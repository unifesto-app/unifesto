import React from 'react';
import { Stack } from 'expo-router';
import StayBookingsScreen from '../../../../src/screens/StayBookingsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Stay requests', headerShown: true }} />
      <StayBookingsScreen />
    </>
  );
}
