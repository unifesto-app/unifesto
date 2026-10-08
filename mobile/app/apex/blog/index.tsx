import React from 'react';
import { Stack } from 'expo-router';
import { BlogListScreen } from '../../../src/screens/apex/PublishingScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Blog', headerShown: true }} />
      <BlogListScreen />
    </>
  );
}
