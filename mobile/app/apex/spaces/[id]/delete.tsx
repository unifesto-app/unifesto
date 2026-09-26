import React from 'react';
import { Stack } from 'expo-router';
import DeleteSpaceScreen from '../../../../src/screens/apex/DeleteSpaceScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Delete space', headerShown: true }} />
      <DeleteSpaceScreen />
    </>
  );
}
