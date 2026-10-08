import React from 'react';
import { Stack } from 'expo-router';
import { CareerApplicationsScreen } from '../../../../src/screens/apex/PublishingScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Applications', headerShown: true }} />
      <CareerApplicationsScreen />
    </>
  );
}
