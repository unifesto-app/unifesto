import React from 'react';
import { Stack } from 'expo-router';
import HackathonJudgeEditorScreen from '../../../../../src/screens/HackathonJudgeEditorScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Judge', headerShown: true }} />
      <HackathonJudgeEditorScreen />
    </>
  );
}
