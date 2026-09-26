import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import LiveSessionScreen from '../../../src/screens/LiveSessionScreen';

export default function LiveSessionRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      {/* The prebuilt room owns the whole screen, including its own controls. */}
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <LiveSessionScreen sessionId={id} />
    </>
  );
}
