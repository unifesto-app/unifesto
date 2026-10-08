import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import SpacesListScreen from '../src/screens/SpacesListScreen';
import MyCirclesScreen from '../src/screens/MyCirclesScreen';

export default function Spaces() {
  const { mine } = useLocalSearchParams<{ mine?: string }>();
  const isMine = mine === 'true' || mine === '1';

  return (
    <>
      <Stack.Screen
        options={{
          title: isMine ? 'My circles' : 'Spaces',
          headerShown: true,
        }}
      />
      {isMine ? <MyCirclesScreen /> : <SpacesListScreen />}
    </>
  );
}
