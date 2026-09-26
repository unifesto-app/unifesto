import React from 'react';
import { Stack } from 'expo-router';
import { SpaceDetailAdminScreen } from '../../../../src/screens/apex/LookupDetailScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Space', headerShown: true }} />
      <SpaceDetailAdminScreen />
    </>
  );
}
