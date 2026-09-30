import React from 'react';
import { Stack } from 'expo-router';
import HackathonCriterionEditorScreen from '../../../../../src/screens/HackathonCriterionEditorScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Criterion', headerShown: true }} />
      <HackathonCriterionEditorScreen />
    </>
  );
}
