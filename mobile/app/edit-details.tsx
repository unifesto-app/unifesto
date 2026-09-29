import React from 'react';
import { Stack } from 'expo-router';
import EditDetailsScreen from '../src/screens/EditDetailsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Edit details', headerShown: true }} />
      <EditDetailsScreen />
    </>
  );
}
