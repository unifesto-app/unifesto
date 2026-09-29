import React from 'react';
import { Stack } from 'expo-router';
import TrafficScreen from '../../src/screens/apex/TrafficScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Traffic', headerShown: true }} />
      <TrafficScreen />
    </>
  );
}
