import React from 'react';
import { Stack } from 'expo-router';
import { UserDetailScreen } from '../../../../src/screens/apex/LookupDetailScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'User', headerShown: true }} />
      <UserDetailScreen />
    </>
  );
}
