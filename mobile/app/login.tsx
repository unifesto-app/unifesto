import React from 'react';
import { Stack } from 'expo-router';
import NewLoginScreen from '../src/screens/LoginScreen';

export default function Login() {
  // The screen draws its own top bar (close / step-back), so the native header
  // stays hidden to avoid a second back arrow. Swipe-back still works.
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <NewLoginScreen />
    </>
  );
}
