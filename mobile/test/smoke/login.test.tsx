import { expect, test } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import React from 'react';
import { AuthProvider } from '../../src/context/AuthContext';
import LoginScreen from '../../src/screens/LoginScreen';
import { mockApi } from './api';
import { mockNav } from './setup';

test('login emails a code, signs in with it and goes back', async () => {
  await SecureStore.deleteItemAsync('unifesto_access_token_v2'); // signed out
  const { calls } = mockApi({
    'POST /auth/email': {},
    'POST /auth/email/verify': {
      accessToken: 'new-token',
      refreshToken: 'new-refresh',
      user: { id: 'u1', fullName: 'Asha Rao', mobileNumber: '+919999999999', mobileVerified: true },
    },
  });

  await render(
    <AuthProvider>
      <LoginScreen />
    </AuthProvider>,
  );

  await fireEvent.changeText(await screen.findByLabelText('Email'), 'asha@example.com');
  await fireEvent.press(screen.getByRole('button', { name: 'Continue with email' }));
  const code = (await screen.findAllByLabelText('Verification code')).find((el) => el.type === 'TextInput');
  await fireEvent.changeText(code!, '123456');

  await waitFor(() => expect(mockNav.router.back).toHaveBeenCalled());
  expect(await SecureStore.getItemAsync('unifesto_access_token_v2')).toBe('new-token');
  expect(calls.find((c) => c.path === '/auth/email/verify')?.body).toEqual({ email: 'asha@example.com', otp: '123456' });
});
