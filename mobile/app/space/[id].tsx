import React from 'react';
import { Stack } from 'expo-router';
import SpaceDetailScreen from '../../src/screens/SpaceDetailScreen';

// The screen loads the space itself (by id or slug) and owns its header
// actions, so this wrapper only names the route.
export default function SpaceDetail() {
  return (
    <>
      <Stack.Screen options={{ title: 'Space', headerShown: true }} />
      <SpaceDetailScreen />
    </>
  );
}
