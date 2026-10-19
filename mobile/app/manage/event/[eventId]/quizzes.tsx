import React from 'react';
import { Stack } from 'expo-router';
import QuizRunnerScreen from '../../../../src/screens/QuizRunnerScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Live quizzes', headerShown: true }} />
      <QuizRunnerScreen />
    </>
  );
}
