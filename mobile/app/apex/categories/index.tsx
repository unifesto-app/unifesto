import React from 'react';
import { Stack } from 'expo-router';
import { CategoriesListScreen } from '../../../src/screens/apex/CategoriesScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Categories', headerShown: true }} />
      <CategoriesListScreen />
    </>
  );
}
