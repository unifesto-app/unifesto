import React from 'react';
import { Stack } from 'expo-router';
import RequestsScreen from '../../src/screens/apex/RequestsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Requests', headerShown: true }} />
      <RequestsScreen />
    </>
  );
}
