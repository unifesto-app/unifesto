import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { CategoryEditScreen } from '../../../src/screens/apex/CategoriesScreens';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: id === 'new' ? 'New category' : 'Edit category', headerShown: true }} />
      <CategoryEditScreen />
    </>
  );
}
