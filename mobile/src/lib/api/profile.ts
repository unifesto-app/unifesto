import { makeAuthenticatedRequest } from './helpers';

export interface Profile {
  id: string;
  mobileNumber: string;
  email?: string;
  mobileVerified: boolean;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  gender: string | null;
  createdAt: string;
}

export const getProfile = async (): Promise<Profile | null> => {
  const response = await makeAuthenticatedRequest('/users/me');
  if (!response?.ok) return null;
  return response.json();
};

export const updateProfile = async (data: {
  fullName?: string;
  username?: string;
  bio?: string;
  gender?: string;
  linkedinUrl?: string;
  instagramUrl?: string;
  githubUrl?: string;
  websiteUrl?: string;
}) => {
  const response = await makeAuthenticatedRequest('/users/me', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });

  if (!response?.ok) {
    const error = await response?.json();
    throw new Error(error?.message || 'Update failed');
  }
  return response.json();
};


export const uploadAvatar = async (uri: string): Promise<string | null> => {
  try {
    // Create form data
    const formData = new FormData();
    const filename = uri.split('/').pop() || 'avatar.jpg';
    const match = /\.(\w+)$/.exec(filename);
    const type = match ? `image/${match[1]}` : 'image/jpeg';

    formData.append('avatar', {
      uri,
      name: filename,
      type,
    } as any);

    const response = await makeAuthenticatedRequest('/users/me/avatar', {
      method: 'POST',
      body: formData as any,
      headers: {
        // Don't set Content-Type, let the browser set it with boundary
      },
    });

    if (!response?.ok) {
      const error = await response?.json();
      throw new Error(error?.message || 'Failed to upload avatar');
    }

    const data = await response.json();
    return data.avatarUrl || null;
  } catch (error) {
    throw error;
  }
};

export const deleteAvatar = async (): Promise<boolean> => {
  const response = await makeAuthenticatedRequest('/users/me/avatar', {
    method: 'DELETE',
  });

  if (!response?.ok) {
    const error = await response?.json();
    throw new Error(error?.message || 'Failed to delete avatar');
  }

  return true;
};

/**
 * Request account deletion. Nothing is removed yet: the account closes
 * automatically after a 30-day grace period unless the request is cancelled.
 */
export const deleteAccount = async (): Promise<
  { success: true; deletionScheduledFor: string } | { success: false; error: string }
> => {
  try {
    const response = await makeAuthenticatedRequest('/users/me', {
      method: 'DELETE',
    });

    if (!response?.ok) {
      const error = await response?.json();
      throw new Error(error?.message || 'Failed to delete account');
    }

    const { deletionScheduledFor } = await response.json();
    return { success: true, deletionScheduledFor };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to delete account',
    };
  }
};

/** Withdraw a pending deletion request during the grace period. */
export const cancelAccountDeletion = async (): Promise<void> => {
  const response = await makeAuthenticatedRequest('/users/me/deletion/cancel', {
    method: 'POST',
  });

  if (!response?.ok) {
    const error = await response?.json();
    throw new Error(error?.message || 'Failed to cancel account deletion');
  }
};
