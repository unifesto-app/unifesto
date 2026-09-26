import React from 'react';
import { Stack } from 'expo-router';
import AdminEditUserScreen from '../../../../src/screens/apex/AdminEditUserScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Edit user', headerShown: true }} />
      <AdminEditUserScreen />
    </>
  );
}
