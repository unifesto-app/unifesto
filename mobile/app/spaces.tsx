import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import SpacesListScreen from '../src/screens/SpacesListScreen';
import MySpacesScreen from '../src/screens/MySpacesScreen';

export default function Spaces() {
  const { mine } = useLocalSearchParams<{ mine?: string }>();
  const isMine = mine === 'true' || mine === '1';

  return (
    <>
      <Stack.Screen
        options={{
          title: isMine ? 'My spaces' : 'Spaces',
          headerShown: true,
        }}
      />
      {isMine ? <MySpacesScreen /> : <SpacesListScreen />}
    </>
  );
}
