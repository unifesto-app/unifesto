import React from 'react';
import { Stack } from 'expo-router';
import QuestionsScreen from '../../../../src/screens/QuestionsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Live Q&A', headerShown: true }} />
      <QuestionsScreen />
    </>
  );
}
