import React from 'react';
import { Stack } from 'expo-router';
import CouponEditorScreen from '../../../../src/screens/CouponEditorScreen';

export default function Route() {
  return (
    <>
      <Stack.Screen options={{ title: 'Code', headerShown: true }} />
      <CouponEditorScreen />
    </>
  );
}
