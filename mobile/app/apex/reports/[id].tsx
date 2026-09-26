import React from 'react';
import { Stack } from 'expo-router';
import { ContentReportDetailScreen } from '../../../src/screens/apex/ContentReportsScreens';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Report', headerShown: true }} />
      <ContentReportDetailScreen />
    </>
  );
}
