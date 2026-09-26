import React from 'react';
import { Stack } from 'expo-router';
import SubSpacesScreen from '../../../../src/screens/SubSpacesScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Sub-spaces', headerShown: true }} />
      <SubSpacesScreen />
    </>
  );
}
