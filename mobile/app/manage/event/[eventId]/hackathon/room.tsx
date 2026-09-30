import React from 'react';
import { Stack } from 'expo-router';
import HackathonRoomEditorScreen from '../../../../../src/screens/HackathonRoomEditorScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Room', headerShown: true }} />
      <HackathonRoomEditorScreen />
    </>
  );
}
