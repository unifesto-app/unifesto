import React from 'react';
import { Stack } from 'expo-router';
import { ContentReportsScreen } from '../../../src/screens/apex/ContentReportsScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Reports', headerShown: true }} />
      <ContentReportsScreen />
    </>
  );
}
