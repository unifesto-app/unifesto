import React from 'react';
import { Stack } from 'expo-router';
import UserProfileScreen from '../src/screens/UserProfileScreen';

export default function UserProfile() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Profile',
          headerShown: true,
        }}
      />
      <UserProfileScreen />
    </>
  );
}
