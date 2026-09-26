import React from 'react';
import { Stack } from 'expo-router';
import SpacesListScreen from '../src/screens/SpacesListScreen';

export default function Organizations() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Organizations',
          headerShown: true,
        }}
      />
      <SpacesListScreen />
    </>
  );
}
