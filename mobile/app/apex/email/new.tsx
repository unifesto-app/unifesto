import React from 'react';
import { Stack } from 'expo-router';
import EmailComposeScreen from '../../../src/screens/apex/EmailComposeScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'New campaign', headerShown: true }} />
      <EmailComposeScreen />
    </>
  );
}
