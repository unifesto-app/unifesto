import React from 'react';
import { Stack } from 'expo-router';
import HackathonAnnounceScreen from '../../../../../src/screens/HackathonAnnounceScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Announcements', headerShown: true }} />
      <HackathonAnnounceScreen />
    </>
  );
}
