/**
 * Backend API Client
 *
 * Centralized Axios client for communicating with the Unifesto NestJS backend.
 * Handles authentication, request/response interceptors, and error handling.
 */

import axios, {
  AxiosInstance,
  AxiosError,
  InternalAxiosRequestConfig,
} from "axios";
import { currentToken, loginHref, renewToken } from "@/console/lib/utils/auth";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:4000";

const backendClient: AxiosInstance = axios.create({
  baseURL: BACKEND_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor — attach the access token, once this page knows its session (V8).
backendClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = await currentToken();
      if (token && !config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    } catch {
      return config;
    }
  },
  (error) => Promise.reject(error)
);

// Response interceptor — normalize errors; on a 401 renew once, else sign in again.
backendClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response) {
      const status = error.response.status;
      const data = (error.response.data ?? {}) as {
        message?: string;
        errors?: unknown;
      };

      // A 401 from a sign-in call is a wrong code, not an expired session.
      const isAuthCall = error.config?.url?.startsWith("/auth/") ?? false;
      if (status === 401 && !isAuthCall && typeof window !== "undefined") {
        // Check-in tabs stay open for hours, longer than an access token
        // lasts: renew it from the web session once and retry.
        const config = error.config as (InternalAxiosRequestConfig & { _renewed?: boolean }) | undefined;
        if (config && !config._renewed) {
          config._renewed = true;
          const token = await renewToken();
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
            return backendClient(config);
          }
        }
        window.location.href = loginHref();
      }

      return Promise.reject({
        status,
        message: data.message || error.message,
        errors: data.errors ?? null,
      });
    }

    if (error.request) {
      return Promise.reject({
        status: 0,
        message: "No response from server. Please check your connection.",
        errors: null,
      });
    }

    return Promise.reject({
      status: 0,
      message: error.message,
      errors: null,
    });
  }
);

export default backendClient;

export interface ApiError {
  status: number;
  message: string;
  errors: unknown | null;
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

/** Wrap an API call so callers get `{ data, error }` instead of throwing. */
export async function apiCall<T>(
  promise: Promise<{ data: T }>
): Promise<{ data: T | null; error: ApiError | null }> {
  try {
    const response = await promise;
    return { data: response.data, error: null };
  } catch (error) {
    return { data: null, error: error as ApiError };
  }
}
