import React from 'react';
import { Stack } from 'expo-router';
import StayBookingDetailScreen from '../../../../../src/screens/StayBookingDetailScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Stay booking', headerShown: true }} />
      <StayBookingDetailScreen />
    </>
  );
}
