import React from 'react';
import { Stack } from 'expo-router';
import StayBookingScreen from '../../src/screens/StayBookingScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Book a stay', headerShown: true }} />
      <StayBookingScreen />
    </>
  );
}
