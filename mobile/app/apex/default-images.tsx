import React from 'react';
import { Stack } from 'expo-router';
import DefaultImagesScreen from '../../src/screens/apex/DefaultImagesScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Default images', headerShown: true }} />
      <DefaultImagesScreen />
    </>
  );
}
