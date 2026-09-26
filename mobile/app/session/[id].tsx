import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import SessionDetailScreen from '../../src/screens/SessionDetailScreen';

export default function SessionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Session',
          headerShown: true,
        }}
      />
      <SessionDetailScreen slug={id} />
    </>
  );
}
