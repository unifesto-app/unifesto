import React from 'react';
import { Stack } from 'expo-router';
import EmailCampaignsScreen from '../../../src/screens/apex/EmailCampaignsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Email', headerShown: true }} />
      <EmailCampaignsScreen />
    </>
  );
}
