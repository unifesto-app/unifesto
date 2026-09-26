import React from 'react';
import { Stack } from 'expo-router';
import PushComposeScreen from '../../../src/screens/apex/PushComposeScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'New push', headerShown: true }} />
      <PushComposeScreen />
    </>
  );
}
