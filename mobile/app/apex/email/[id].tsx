import React from 'react';
import { Stack } from 'expo-router';
import EmailCampaignDetailScreen from '../../../src/screens/apex/EmailCampaignDetailScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Campaign', headerShown: true }} />
      <EmailCampaignDetailScreen />
    </>
  );
}
