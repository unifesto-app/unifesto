import React from 'react';
import { Stack } from 'expo-router';
import NotificationSettingsScreen from '../src/screens/NotificationSettingsScreen';

export default function NotificationSettings() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Notifications',
          headerShown: true,
        }}
      />
      <NotificationSettingsScreen />
    </>
  );
}
