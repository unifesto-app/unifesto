import React from 'react';
import { Stack } from 'expo-router';
import SpaceMembersScreen from '../../../../src/screens/SpaceMembersScreen';

export default function SpaceMembers() {
  return (
    <>
      <Stack.Screen options={{ title: 'Members', headerShown: true }} />
      <SpaceMembersScreen />
    </>
  );
}
