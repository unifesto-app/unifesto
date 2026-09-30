import React from 'react';
import { Stack } from 'expo-router';
import HackathonRoomsScreen from '../../../../../src/screens/HackathonRoomsScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Rooms', headerShown: true }} />
      <HackathonRoomsScreen />
    </>
  );
}
