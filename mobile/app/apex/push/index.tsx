import React from 'react';
import { Stack } from 'expo-router';
import PushCampaignsScreen from '../../../src/screens/apex/PushCampaignsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Push notifications', headerShown: true }} />
      <PushCampaignsScreen />
    </>
  );
}
