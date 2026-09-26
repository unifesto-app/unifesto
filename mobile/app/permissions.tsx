import React from 'react';
import { Stack } from 'expo-router';
import PermissionsScreen from '../src/screens/PermissionsScreen';

export default function Permissions() {
  return (
    <>
      <Stack.Screen options={{ title: 'Permissions', headerShown: true }} />
      <PermissionsScreen />
    </>
  );
}
