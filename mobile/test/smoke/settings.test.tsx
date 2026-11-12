import { expect, test } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import React from 'react';
import { AuthProvider } from '../../src/context/AuthContext';
import SettingsScreen from '../../src/screens/SettingsScreen';
import { mockApi } from './api';

const me = { id: 'u1', fullName: 'Asha Rao', mobileNumber: '+919999999999', mobileVerified: true };

test('signed in, Settings has my account rows and Sign out', async () => {
  mockApi({ 'GET /users/me': me, 'GET /support/tickets/stats': { unread: 2 } });
  await render(
    <AuthProvider>
      <SettingsScreen />
    </AuthProvider>,
  );

  expect(await screen.findByRole('button', { name: 'Sign out' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Account' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Notifications' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Permissions' })).toBeTruthy();
});

test('a guest gets Appearance and help, but no account rows', async () => {
  await SecureStore.deleteItemAsync('unifesto_access_token_v2'); // signed out
  mockApi({});
  await render(
    <AuthProvider>
      <SettingsScreen />
    </AuthProvider>,
  );

  expect(await screen.findByText('Appearance')).toBeTruthy();
  expect(screen.getByText('Contact support')).toBeTruthy();
  expect(screen.queryByText('Account')).toBeNull();
  expect(screen.queryByText('Sign out')).toBeNull();
});
