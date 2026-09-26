import React from 'react';
import { Stack } from 'expo-router';
import SponsorTierEditorScreen from '../../../../src/screens/SponsorTierEditorScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Tier', headerShown: true }} />
      <SponsorTierEditorScreen />
    </>
  );
}
