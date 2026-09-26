import React from 'react';
import { Stack } from 'expo-router';
import ContentItemEditorScreen from '../../../../src/screens/ContentItemEditorScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Edit', headerShown: true }} />
      <ContentItemEditorScreen />
    </>
  );
}
