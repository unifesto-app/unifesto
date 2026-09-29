import React from 'react';
import { Stack } from 'expo-router';
import StaysManageScreen from '../../../../src/screens/StaysManageScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Unifesto Stay', headerShown: true }} />
      <StaysManageScreen />
    </>
  );
}
