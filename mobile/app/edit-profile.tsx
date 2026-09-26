import React from 'react';
import { Stack } from 'expo-router';
import EditProfileScreen from '../src/screens/EditProfileScreen';

export default function EditProfile() {
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Edit profile',
          headerShown: true,
        }}
      />
      <EditProfileScreen />
    </>
  );
}
