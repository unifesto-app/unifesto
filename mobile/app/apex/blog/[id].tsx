import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { BlogEditScreen } from '../../../src/screens/apex/PublishingScreens';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: id === 'new' ? 'New post' : 'Edit post', headerShown: true }} />
      <BlogEditScreen />
    </>
  );
}
