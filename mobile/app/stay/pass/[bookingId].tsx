import React from 'react';
import { Stack } from 'expo-router';
import StayPassScreen from '../../../src/screens/StayPassScreen';

// The guest's stay; a push deep link (unifesto://stay/pass/<id>) lands here.
export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Stay Pass', headerShown: true }} />
      <StayPassScreen />
    </>
  );
}
