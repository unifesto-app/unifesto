import React from 'react';
import { Stack } from 'expo-router';
import CompetitionScreen from '../../src/screens/CompetitionScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Competition', headerShown: true }} />
      <CompetitionScreen />
    </>
  );
}
