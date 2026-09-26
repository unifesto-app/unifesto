"use client";

import { apiClient } from "./client";

// Configuration
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

/**
 * Validate file before upload
 */
function validateFile(file: File): { valid: boolean; error?: string } {
  // Check file type
  if (!ALLOWED_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Invalid file type. Allowed types: ${ALLOWED_TYPES.join(", ")}`,
    };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  return { valid: true };
}

/**
 * Upload avatar via backend API
 */
export async function uploadAvatar(file: File): Promise<{
  success: boolean;
  url?: string;
  error?: string;
}> {
  try {
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Create FormData
    const formData = new FormData();
    formData.append("avatar", file);

    // Upload via backend API
    const { data, error } = await apiClient.upload<{
      message: string;
      avatar_url: string;
    }>("/auth/avatar", formData);

    if (error || !data) {
      return { success: false, error: error || "Failed to upload avatar" };
    }

    return { success: true, url: data.avatar_url };
  } catch (error) {
    console.error("Avatar upload error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to upload avatar",
    };
  }
}

/**
 * Delete avatar via backend API
 */
export async function deleteAvatar(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { data, error } = await apiClient.delete<{ message: string }>(
      "/auth/avatar"
    );

    if (error) {
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    console.error("Avatar delete error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to delete avatar",
    };
  }
}

/**
 * Get avatar upload configuration
 */
export function getAvatarConfig() {
  return {
    maxFileSize: MAX_FILE_SIZE,
    maxFileSizeMB: MAX_FILE_SIZE / 1024 / 1024,
    allowedTypes: ALLOWED_TYPES,
    maxWidth: 800,
    maxHeight: 800,
    compressionQuality: 0.8,
  };
}
