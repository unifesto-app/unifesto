"use client";

import { createClient } from "@/lib/supabase/client";

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

/**
 * Get authentication token from Supabase
 */
async function getAuthToken(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * API Client for making authenticated requests to the backend
 */
export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Make an authenticated API request
   */
  async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data?: T; error?: string }> {
    try {
      const token = await getAuthToken();

      if (!token) {
        return { error: "Not authenticated" };
      }

      const url = `${this.baseUrl}${endpoint}`;
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      };

      const response = await fetch(url, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          error:
            errorData.message ||
            errorData.error ||
            `Request failed with status ${response.status}`,
        };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      console.error("API request error:", error);
      return {
        error: error instanceof Error ? error.message : "Request failed",
      };
    }
  }

  /**
   * GET request
   */
  async get<T>(endpoint: string): Promise<{ data?: T; error?: string }> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  /**
   * POST request
   */
  async post<T>(
    endpoint: string,
    body?: any
  ): Promise<{ data?: T; error?: string }> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PATCH request
   */
  async patch<T>(
    endpoint: string,
    body?: any
  ): Promise<{ data?: T; error?: string }> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * PUT request
   */
  async put<T>(
    endpoint: string,
    body?: any
  ): Promise<{ data?: T; error?: string }> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string): Promise<{ data?: T; error?: string }> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }

  /**
   * Upload file with multipart/form-data
   */
  async upload<T>(
    endpoint: string,
    formData: FormData
  ): Promise<{ data?: T; error?: string }> {
    try {
      const token = await getAuthToken();

      if (!token) {
        return { error: "Not authenticated" };
      }

      const url = `${this.baseUrl}${endpoint}`;
      const headers = {
        Authorization: `Bearer ${token}`,
        // Don't set Content-Type for FormData - browser will set it with boundary
      };

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          error:
            errorData.message ||
            errorData.error ||
            `Upload failed with status ${response.status}`,
        };
      }

      const data = await response.json();
      return { data };
    } catch (error) {
      console.error("Upload error:", error);
      return {
        error: error instanceof Error ? error.message : "Upload failed",
      };
    }
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export API base URL for reference
export const API_URL = API_BASE_URL;
