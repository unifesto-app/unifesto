import React from 'react';
import { Stack } from 'expo-router';
import AdminSupportThreadScreen from '../../../src/screens/apex/AdminSupportThreadScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Support', headerShown: true }} />
      <AdminSupportThreadScreen />
    </>
  );
}
