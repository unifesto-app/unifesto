/**
 * Authentication API Service
 * Handles all authentication-related API calls to the new backend
 */

import { API_URL } from '../constants';

export interface User {
  id: string;
  mobileNumber: string;
  mobileVerified: boolean;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  gender: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  githubUrl: string | null;
  websiteUrl: string | null;
  createdAt: string;
  /** Set while a deletion request is pending: when the account will close. */
  deletionScheduledFor?: string | null;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
  requiresMobileVerification?: boolean;
  isNewUser?: boolean;
  tempToken?: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

/**
 * Login with Google
 */
export async function loginWithGoogle(idToken: string): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/google`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Google login failed');
  }

  return response.json();
}

/**
 * Login with Apple
 */
export async function loginWithApple(
  identityToken: string,
  authorizationCode: string
): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/apple`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ identityToken, authorizationCode }),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Apple login failed');
  }

  return response.json();
}

/**
 * Send OTP to email
 */
export async function sendEmailOtp(email: string): Promise<{ message: string }> {
  const response = await fetch(`${API_URL}/auth/email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Failed to send OTP');
  }

  return response.json();
}

/**
 * Verify email OTP
 */
export async function verifyEmailOtp(
  email: string,
  otp: string
): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/email/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, otp }),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Invalid OTP');
  }

  return response.json();
}

/**
 * Send OTP to mobile number (WhatsApp)
 */
export async function sendMobileOtp(
  mobileNumber: string,
  tempToken: string
): Promise<{ message: string }> {
  const response = await fetch(`${API_URL}/auth/mobile/send-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mobileNumber, tempToken }),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Failed to send OTP');
  }

  return response.json();
}

/**
 * Verify mobile OTP
 */
export async function verifyMobileOtp(
  mobileNumber: string,
  otp: string,
  tempToken: string
): Promise<AuthResponse> {
  const response = await fetch(`${API_URL}/auth/verify-mobile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ mobileNumber, otp, tempToken }),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Invalid OTP');
  }

  return response.json();
}

/**
 * Get current session
 */
export async function getSession(accessToken: string): Promise<{ user: User }> {
  const response = await fetch(`${API_URL}/auth/session`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Failed to get session');
  }

  return response.json();
}

/**
 * Logout
 */
export async function logout(accessToken: string): Promise<{ message: string }> {
  const response = await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Logout failed');
  }

  return response.json();
}

/**
 * Get current user profile
 */
export async function getCurrentUser(accessToken: string): Promise<User> {
  const response = await fetch(`${API_URL}/users/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Failed to get user profile');
  }

  return response.json();
}

/**
 * Update user profile
 */
export async function updateUserProfile(
  accessToken: string,
  data: {
    username?: string;
    fullName?: string;
    bio?: string;
    gender?: string;
    linkedinUrl?: string;
    instagramUrl?: string;
    githubUrl?: string;
    websiteUrl?: string;
  }
): Promise<User> {
  const response = await fetch(`${API_URL}/users/me`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Failed to update profile');
  }

  return response.json();
}

/**
 * Upload avatar
 */
export async function uploadAvatar(
  accessToken: string,
  uri: string
): Promise<{ avatarUrl: string }> {
  const formData = new FormData();
  const filename = uri.split('/').pop() || 'avatar.jpg';
  const match = /\.(\w+)$/.exec(filename);
  const type = match ? `image/${match[1]}` : 'image/jpeg';

  // React Native FormData requires this specific format
  formData.append('avatar', {
    uri: uri,
    name: filename,
    type: type,
  } as any);

  const response = await fetch(`${API_URL}/users/me/avatar`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      // Don't set Content-Type header - let the browser/fetch set it with boundary
    },
    body: formData,
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Failed to upload avatar');
  }

  return response.json();
}

/**
 * Check username availability
 */
export async function checkUsernameAvailability(
  username: string
): Promise<{ available: boolean }> {
  const response = await fetch(`${API_URL}/users/check-username`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Failed to check username');
  }

  return response.json();
}

/**
 * Get user by username
 */
export async function getUserByUsername(username: string): Promise<User> {
  const response = await fetch(`${API_URL}/users/${username}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'User not found');
  }

  return response.json();
}

/**
 * User Identity (Linked Account)
 */
export interface UserIdentity {
  id: string;
  provider: 'EMAIL' | 'GOOGLE' | 'APPLE';
  email: string | null;
  emailVerified: boolean;
  isPrimary: boolean;
  createdAt: string;
}

/**
 * Get current user's linked accounts
 */
export async function getUserIdentities(accessToken: string): Promise<UserIdentity[]> {
  const response = await fetch(`${API_URL}/users/me/identities`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Failed to get linked accounts');
  }

  return response.json();
}

export async function setPrimaryIdentity(accessToken: string, identityId: string): Promise<{ message: string }> {
  const response = await fetch(`${API_URL}/users/me/identities/${identityId}/primary`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Failed to set primary email');
  }
  return response.json();
}

export async function removeIdentity(accessToken: string, identityId: string): Promise<{ message: string }> {
  const response = await fetch(`${API_URL}/users/me/identities/${identityId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });
  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.message || 'Failed to remove account');
  }
  return response.json();
}
