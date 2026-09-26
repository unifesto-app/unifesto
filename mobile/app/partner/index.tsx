import React from 'react';
import { Stack } from 'expo-router';
import PartnerLinksScreen from '../../src/screens/PartnerLinksScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Partner stats', headerShown: true }} />
      <PartnerLinksScreen />
    </>
  );
}
