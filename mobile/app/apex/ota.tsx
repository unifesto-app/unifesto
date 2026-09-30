import React from 'react';
import { Stack } from 'expo-router';
import OtaUpdatesScreen from '../../src/screens/apex/OtaUpdatesScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'OTA updates', headerShown: true }} />
      <OtaUpdatesScreen />
    </>
  );
}
