import React from 'react';
import { Stack } from 'expo-router';
import AboutScreen from '../src/screens/AboutScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'About', headerShown: true }} />
      <AboutScreen />
    </>
  );
}
