import React from 'react';
import { Stack } from 'expo-router';
import HackathonQueuesScreen from '../../../../../src/screens/HackathonQueuesScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Live queues', headerShown: true }} />
      <HackathonQueuesScreen />
    </>
  );
}
