"use client";

import { apiClient } from "./client";
import type { Profile, UpdateProfileDto } from "@/types/profile";

/**
 * Get current user profile from backend API
 */
export async function getProfile(): Promise<Profile | null> {
  try {
    const { data, error } = await apiClient.get<{
      id: string;
      email: string;
      profile: Profile;
    }>("/auth/me");

    if (error) {
      console.error("Error fetching profile:", error);
      return null;
    }

    if (!data) {
      return null;
    }

    // Merge id and email into profile
    return {
      ...data.profile,
      id: data.id,
      email: data.email,
    };
  } catch (error) {
    console.error("Unexpected error in getProfile:", error);
    return null;
  }
}

/**
 * Create profile if it doesn't exist (sync with backend)
 */
export async function createProfileIfNotExists(): Promise<Profile | null> {
  try {
    const { data, error } = await apiClient.post<{
      message: string;
      profile: Profile;
    }>("/auth/sync");

    if (error) {
      console.error("Error creating profile:", error);
      return null;
    }

    return data?.profile || null;
  } catch (error) {
    console.error("Unexpected error in createProfileIfNotExists:", error);
    return null;
  }
}

/**
 * Update user profile via backend API
 */
export async function updateProfile(
  updateDto: UpdateProfileDto
): Promise<Profile | null> {
  try {
    const { data, error } = await apiClient.patch<{
      message: string;
      profile: Profile;
    }>("/auth/profile", updateDto);

    if (error) {
      console.error("Error updating profile:", error);
      throw new Error(error);
    }

    return data?.profile || null;
  } catch (error) {
    console.error("Unexpected error in updateProfile:", error);
    throw error;
  }
}

/**
 * Check if username is available
 * Note: This would need a backend endpoint. For now, we'll try to update and catch the error.
 */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  // This would need a dedicated backend endpoint like GET /auth/check-username/:username
  // For now, return true and let the update endpoint handle validation
  console.warn("isUsernameAvailable: Backend endpoint not implemented yet");
  return true;
}
