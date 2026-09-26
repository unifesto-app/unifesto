import React from 'react';
import { Stack } from 'expo-router';
import EventTeamScreen from '../../../../src/screens/EventTeamScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Event team', headerShown: true }} />
      <EventTeamScreen />
    </>
  );
}
