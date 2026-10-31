import React from 'react';
import { Stack } from 'expo-router';
import LinkDeviceScreen from '../src/screens/LinkDeviceScreen';

export default function Route() {
  return (
    <>
      {/* The camera is dark in every theme, so the header is always white on it. */}
      <Stack.Screen
        options={{
          title: 'Link a device',
          headerShown: true,
          headerTintColor: '#ffffff',
          headerTitleStyle: { color: '#ffffff' },
          contentStyle: { backgroundColor: '#000000' },
        }}
      />
      <LinkDeviceScreen />
    </>
  );
}
