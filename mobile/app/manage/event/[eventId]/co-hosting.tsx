import React from 'react';
import { Stack } from 'expo-router';
import CoHostingScreen from '../../../../src/screens/CoHostingScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Co-hosts', headerShown: true }} />
      <CoHostingScreen />
    </>
  );
}
