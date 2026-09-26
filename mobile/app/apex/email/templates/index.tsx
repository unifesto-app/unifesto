import React from 'react';
import { Stack } from 'expo-router';
import EmailTemplatesScreen from '../../../../src/screens/apex/EmailTemplatesScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Templates', headerShown: true }} />
      <EmailTemplatesScreen />
    </>
  );
}
