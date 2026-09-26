import React from 'react';
import { Stack } from 'expo-router';
import QueueReviewScreen from '../../../../src/screens/apex/QueueReviewScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Request', headerShown: true }} />
      <QueueReviewScreen />
    </>
  );
}
