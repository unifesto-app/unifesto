import React from 'react';
import { Stack } from 'expo-router';
import SettlementsScreen from '../../../src/screens/apex/money/SettlementsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Settlements', headerShown: true }} />
      <SettlementsScreen />
    </>
  );
}
