import React from 'react';
import { Stack } from 'expo-router';
import SponsorPortalScreen from '../../../src/screens/SponsorPortalScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Sponsor', headerShown: true }} />
      <SponsorPortalScreen />
    </>
  );
}
