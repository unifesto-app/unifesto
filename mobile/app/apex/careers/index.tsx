import React from 'react';
import { Stack } from 'expo-router';
import { CareersListScreen } from '../../../src/screens/apex/PublishingScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Careers', headerShown: true }} />
      <CareersListScreen />
    </>
  );
}
