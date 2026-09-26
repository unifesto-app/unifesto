import React from 'react';
import { Stack } from 'expo-router';
import FavoritesScreen from '../src/screens/FavoritesScreen';

export default function Favorites() {

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Saved',
          headerShown: true,
        }}
      />
      <FavoritesScreen />
    </>
  );
}
