import React from 'react';
import { Stack } from 'expo-router';
import IamScreen from '../../src/screens/apex/IamScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'IAM', headerShown: true }} />
      <IamScreen />
    </>
  );
}
