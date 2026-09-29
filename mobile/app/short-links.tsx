import React from 'react';
import { Stack } from 'expo-router';
import ShortLinksScreen from '../src/screens/ShortLinksScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Short links', headerShown: true }} />
      <ShortLinksScreen />
    </>
  );
}
