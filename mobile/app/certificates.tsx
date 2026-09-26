import React from 'react';
import { Stack } from 'expo-router';
import CertificatesScreen from '../src/screens/CertificatesScreen';

export default function Certificates() {

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Certificates',
          headerShown: true,
        }}
      />
      <CertificatesScreen />
    </>
  );
}
