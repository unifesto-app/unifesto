import React from 'react';
import { Stack } from 'expo-router';
import PollsScreen from '../../../../src/screens/PollsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Live polls', headerShown: true }} />
      <PollsScreen />
    </>
  );
}
