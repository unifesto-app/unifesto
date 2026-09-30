import React from 'react';
import { Stack } from 'expo-router';
import HackathonThemesScreen from '../../../../../src/screens/HackathonThemesScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Themes', headerShown: true }} />
      <HackathonThemesScreen />
    </>
  );
}
