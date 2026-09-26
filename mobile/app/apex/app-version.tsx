import React from 'react';
import { Stack } from 'expo-router';
import AppVersionScreen from '../../src/screens/apex/AppVersionScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'App version', headerShown: true }} />
      <AppVersionScreen />
    </>
  );
}
