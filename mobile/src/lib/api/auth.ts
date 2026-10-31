/**
 * Account API: the signed-in user's profile and linked sign-in methods.
 * Sign-in itself lives in AuthContext. Everything here goes through the shared
 * helpers, which attach the current token (refreshing it when it expired).
 */

import { expectOk, makeAuthenticatedRequest, makePublicRequest } from './helpers';
import { uploadImage } from './upload';

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
  /** Z11: when I confirmed I am 18 or older; null = not yet. */
  ageConfirmedAt?: string | null;
}

/** The signed-in user's profile. */
export async function getCurrentUser(): Promise<User> {
  return expectOk(await makeAuthenticatedRequest('/users/me'), 'Failed to get user profile');
}

/** Update the signed-in user's profile. */
export async function updateUserProfile(data: {
  username?: string;
  fullName?: string;
  bio?: string;
  gender?: string;
  linkedinUrl?: string;
  instagramUrl?: string;
  githubUrl?: string;
  websiteUrl?: string;
  /** Z11: "I am 18 or older". Stamped once server-side. */
  ageConfirmed?: true;
}): Promise<User> {
  return expectOk(
    await makeAuthenticatedRequest('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
    'Failed to update profile',
  );
}

/** Upload a new avatar (native multipart uploader; RN FormData drops the file on iOS). */
export async function uploadAvatar(uri: string): Promise<{ avatarUrl: string }> {
  const result = await uploadImage<{ avatarUrl: string }>('/users/me/avatar', 'avatar', uri);
  if (!result.ok) throw new Error(result.message || 'Failed to upload avatar');
  return result.data;
}

/** Whether a username is free. */
export async function checkUsernameAvailability(username: string): Promise<{ available: boolean }> {
  return expectOk(
    await makePublicRequest('/users/check-username', { method: 'POST', body: JSON.stringify({ username }) }),
    'Failed to check username',
  );
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

/** The signed-in user's linked accounts. */
export async function getUserIdentities(): Promise<UserIdentity[]> {
  return expectOk(await makeAuthenticatedRequest('/users/me/identities'), 'Failed to get linked accounts');
}

export async function setPrimaryIdentity(identityId: string): Promise<{ message: string }> {
  return expectOk(
    await makeAuthenticatedRequest(`/users/me/identities/${identityId}/primary`, { method: 'PATCH' }),
    'Failed to set primary email',
  );
}

export async function removeIdentity(identityId: string): Promise<{ message: string }> {
  return expectOk(
    await makeAuthenticatedRequest(`/users/me/identities/${identityId}`, { method: 'DELETE' }),
    'Failed to remove account',
  );
}

/** A phone or browser signed in to my account. `current` is this phone. */
export interface LinkedDevice {
  id: string;
  name: string;
  kind: 'app' | 'browser';
  current: boolean;
  signedInAt: string;
  lastActiveAt: string;
}

export async function getLinkedDevices(): Promise<LinkedDevice[]> {
  return expectOk(await makeAuthenticatedRequest('/auth/sessions'), 'Failed to load linked devices');
}

/** Signs that device out right away; a phone also stops getting notifications. */
export async function signOutDevice(id: string): Promise<{ revoked: true }> {
  return expectOk(
    await makeAuthenticatedRequest(`/auth/sessions/${id}`, { method: 'DELETE' }),
    "Couldn't sign that device out",
  );
}
