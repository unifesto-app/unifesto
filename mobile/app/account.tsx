import React from 'react';
import { Stack } from 'expo-router';
import AccountSettingsScreen from '../src/screens/AccountSettingsScreen';

export default function Account() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Account settings',
          headerShown: true,
        }}
      />
      <AccountSettingsScreen />
    </>
  );
}