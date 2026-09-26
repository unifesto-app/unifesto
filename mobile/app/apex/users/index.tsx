import React from 'react';
import { Stack } from 'expo-router';
import { UsersLookupScreen } from '../../../src/screens/apex/LookupScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Users', headerShown: true }} />
      <UsersLookupScreen />
    </>
  );
}
