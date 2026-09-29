import React from 'react';
import { Stack } from 'expo-router';
import ShortLinkStatsScreen from '../src/screens/ShortLinkStatsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Link stats', headerShown: true }} />
      <ShortLinkStatsScreen />
    </>
  );
}
