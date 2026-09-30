import React from 'react';
import { Stack } from 'expo-router';
import HackathonStatementEditorScreen from '../../../../../src/screens/HackathonStatementEditorScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Problem statement', headerShown: true }} />
      <HackathonStatementEditorScreen />
    </>
  );
}
