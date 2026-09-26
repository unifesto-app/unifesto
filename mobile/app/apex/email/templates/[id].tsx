import React from 'react';
import { Stack } from 'expo-router';
import EmailTemplateEditScreen from '../../../../src/screens/apex/EmailTemplateEditScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Template', headerShown: true }} />
      <EmailTemplateEditScreen />
    </>
  );
}
