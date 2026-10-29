import React from 'react';
import { Stack } from 'expo-router';
import FeedbackResultsScreen from '../../../../src/screens/FeedbackResultsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Feedback', headerShown: true }} />
      <FeedbackResultsScreen />
    </>
  );
}
