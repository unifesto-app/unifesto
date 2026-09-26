import React from 'react';
import { Stack } from 'expo-router';
import ManageSpaceScreen from '../../../../src/screens/ManageSpaceScreen';

// Operator view of one space, pushed from the Space tab. The screen loads its
// own data from the spaceId param.
export default function ManageSpace() {
  return (
    <>
      <Stack.Screen options={{ title: 'Manage space', headerShown: true }} />
      <ManageSpaceScreen />
    </>
  );
}
