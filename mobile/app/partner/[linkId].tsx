import React from 'react';
import { Stack } from 'expo-router';
import PartnerStatsScreen from '../../src/screens/PartnerStatsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Partner stats', headerShown: true }} />
      <PartnerStatsScreen />
    </>
  );
}
