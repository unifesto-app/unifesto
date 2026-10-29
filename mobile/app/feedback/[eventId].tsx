import React from 'react';
import { Stack } from 'expo-router';
import FeedbackScreen from '../../src/screens/FeedbackScreen';

// F1: rate an event I attended.
export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Feedback', headerShown: true }} />
      <FeedbackScreen />
    </>
  );
}
