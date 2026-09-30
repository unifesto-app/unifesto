import React from 'react';
import { Stack } from 'expo-router';
import HackathonCertificatesScreen from '../../../../../src/screens/HackathonCertificatesScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Certificates', headerShown: true }} />
      <HackathonCertificatesScreen />
    </>
  );
}
