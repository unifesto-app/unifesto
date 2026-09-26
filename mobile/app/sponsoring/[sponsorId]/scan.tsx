import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import BoothScanScreen from '../../../src/screens/BoothScanScreen';

export default function Route() {
  const { sponsorId, eventSponsorId, title } = useLocalSearchParams<{ sponsorId: string; eventSponsorId: string; title?: string }>();
  return (
    <>
      {/* The camera is dark in every theme, so the header is always white on it. */}
      <Stack.Screen
        options={{
          title: title || 'Booth scan',
          headerShown: true,
          headerTintColor: '#ffffff',
          headerTitleStyle: { color: '#ffffff' },
          contentStyle: { backgroundColor: '#000000' },
        }}
      />
      <BoothScanScreen sponsorId={sponsorId} eventSponsorId={eventSponsorId} />
    </>
  );
}
