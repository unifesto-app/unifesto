import React from 'react';
import { Stack } from 'expo-router';
import AddSpaceMemberScreen from '../../../../src/screens/AddSpaceMemberScreen';

export default function AddSpaceMember() {
  return (
    <>
      <Stack.Screen options={{ title: 'Add member', headerShown: true }} />
      <AddSpaceMemberScreen />
    </>
  );
}
