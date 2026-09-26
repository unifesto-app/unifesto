import React from 'react';
import { Stack } from 'expo-router';
import SpaceHierarchyScreen from '../../../../src/screens/apex/SpaceHierarchyScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Hierarchy', headerShown: true }} />
      <SpaceHierarchyScreen />
    </>
  );
}
