import React from 'react';
import { Stack } from 'expo-router';
import SeriesDatesScreen from '../../../../src/screens/SeriesDatesScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Dates', headerShown: true }} />
      <SeriesDatesScreen />
    </>
  );
}
