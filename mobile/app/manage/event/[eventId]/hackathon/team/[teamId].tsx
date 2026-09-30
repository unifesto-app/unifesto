import React from 'react';
import { Stack } from 'expo-router';
import HackathonTeamEditorScreen from '../../../../../../src/screens/HackathonTeamEditorScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Team', headerShown: true }} />
      <HackathonTeamEditorScreen />
    </>
  );
}
