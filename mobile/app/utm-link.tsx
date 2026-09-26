import React from 'react';
import { Stack } from 'expo-router';
import UtmLinkBuilderScreen from '../src/screens/UtmLinkBuilderScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Tracking link', headerShown: true }} />
      <UtmLinkBuilderScreen />
    </>
  );
}
