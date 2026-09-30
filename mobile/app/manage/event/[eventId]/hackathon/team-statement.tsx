import React from 'react';
import { Stack } from 'expo-router';
import HackathonTeamStatementScreen from '../../../../../src/screens/HackathonTeamStatementScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Problem statement', headerShown: true }} />
      <HackathonTeamStatementScreen />
    </>
  );
}
