import React from 'react';
import { Stack } from 'expo-router';
import LeadsScreen from '../../../../src/screens/LeadsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Leads', headerShown: true }} />
      <LeadsScreen />
    </>
  );
}
