import React from 'react';
import { Stack } from 'expo-router';
import LeadDetailScreen from '../../../../src/screens/LeadDetailScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Lead', headerShown: true }} />
      <LeadDetailScreen />
    </>
  );
}
