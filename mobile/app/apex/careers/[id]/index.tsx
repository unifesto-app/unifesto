import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { CareerEditScreen } from '../../../../src/screens/apex/PublishingScreens';

export default function Route() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <>
      <Stack.Screen options={{ title: id === 'new' ? 'New job' : 'Edit job', headerShown: true }} />
      <CareerEditScreen />
    </>
  );
}
