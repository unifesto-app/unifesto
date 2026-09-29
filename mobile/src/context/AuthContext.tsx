import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getCrashlytics, setUserId as setCrashlyticsUserId } from '@react-native-firebase/crashlytics';
import { getToken, saveToken, saveTokens, clearToken, makeAuthenticatedRequest, makePublicRequest } from '../lib/api/helpers';
import OneSignalService from '../services/OneSignalService';
import { maybeReportAppVersion } from '../lib/appVersionReport';
import { syncPushDevice, unregisterPushDevice } from '../lib/pushDeviceReport';
import { cancelAccountDeletion } from '../lib/api/profile';
import { AppAlert } from '../components/ui/AppAlert';
import { syncUpNextWidget } from '../widgets/sync';

interface User {
  id: string;
  mobileNumber: string;
  mobileVerified: boolean;
  username: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  /** Set while a deletion request is pending: when the account will close. */
  deletionScheduledFor?: string | null;
  /** Platform roles from GET /users/me. Login responses omit it (undefined ≠ none). */
  roles?: { role: { code: string; name?: string } }[];
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  tempToken: string | null;
  // OTP Auth
  sendMobileOtp: (mobileNumber: string) => Promise<void>;
  verifyMobileOtp: (mobileNumber: string, otp: string) => Promise<{ isNewUser: boolean }>;
  sendEmailOtp: (email: string) => Promise<void>;
  verifyEmailOtp: (email: string, otp: string) => Promise<void>;
  // Social Auth
  loginWithGoogle: (idToken: string) => Promise<void>;
  loginWithApple: (identityToken: string, authorizationCode: string) => Promise<void>;
  loginWithCognito: (idToken: string) => Promise<void>;
  // Actions
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (data: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tempToken, setTempToken] = useState<string | null>(null);

  useEffect(() => {
    loadSession();
  }, []);

  // Once a session is active, report the installed app version so staff can see
  // which build each account runs (Apex → Users). Best-effort and self-gated
  // (version change or 24h), so it's cheap to re-run: also when the token lands
  // (at sign-up the user can be set before the token is saved, and that first
  // report fails) and on every return to the foreground, so a failed report is
  // retried without waiting for a cold start.
  useEffect(() => {
    if (!user?.id || !token) return;
    const userId = user.id;
    void maybeReportAppVersion(userId);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void maybeReportAppVersion(userId);
    });
    return () => sub.remove();
  }, [user?.id, token]);

  // Link this install's OneSignal push subscription (device id) to the user on
  // the backend, now and whenever the subscription changes (id issued late on
  // first launch, opt-in toggled), so per-user pushes can reach this device.
  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    void syncPushDevice(userId);
    return OneSignalService.onPushSubscriptionChange(() => {
      void syncPushDevice(userId);
    });
  }, [user?.id]);

  // Signing back in during the 30-day deletion grace period: offer to keep the
  // account. Asked once per signed-in user per app session, so "Not now"
  // doesn't nag on every re-render; Account settings keeps a Cancel action.
  const deletionPromptedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id) {
      deletionPromptedFor.current = null; // signed out: ask again on next sign-in
      return;
    }
    if (!user.deletionScheduledFor || deletionPromptedFor.current === user.id) return;
    deletionPromptedFor.current = user.id;

    const date = new Date(user.deletionScheduledFor).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    AppAlert.alert('Your account is being deleted', `It will be permanently deleted on ${date}. Keep your account?`, [
      { text: 'Not now', style: 'cancel' },
      {
        text: 'Keep my account',
        onPress: async () => {
          try {
            await cancelAccountDeletion();
            setUser((prev) => (prev ? { ...prev, deletionScheduledFor: null } : prev));
            AppAlert.alert('Welcome back', 'Your account will stay active.');
          } catch (e: any) {
            AppAlert.alert('Error', e.message || 'Failed to cancel account deletion');
          }
        },
      },
    ]);
  }, [user?.id, user?.deletionScheduledFor]);

  const loadSession = async () => {
    try {
      if (await getToken()) {
        // Goes through the shared helper so an expired token is refreshed
        // silently and, with no network, the last saved /users/me is served —
        // opening the app offline keeps you signed in.
        const response = await makeAuthenticatedRequest('/users/me');
        if (response?.ok) {
          setToken(await getToken());
          const userData = await response.json();
          setUser(userData);
          await setCrashlyticsUserId(getCrashlytics(), userData.id);
          // Re-link this device to the user in OneSignal on every startup, not
          // just at interactive login. Without this, returning users (restored
          // session, reinstall, or anyone who first authenticated before
          // identity-linking shipped) keep a blank external_id and the backend
          // can't target them by external_id. login() is idempotent; we don't
          // re-prompt for permission here (that stays in handleAuthSuccess).
          try {
            OneSignalService.login(userData.id);
          } catch {
            // Non-fatal: push is optional and must never block session restore.
          }
        } else if (response?.status === 401) {
          // The server rejected the session outright (refresh already failed).
          await clearToken();
        }
        // Anything else (no network and no saved profile, 5xx): keep the
        // tokens so the next launch can still restore the session.
      }
    } catch (error) {
      if (__DEV__) console.warn('[auth] session restore failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthSuccess = async (accessToken: string, userData: User, refreshToken?: string) => {
    await saveTokens(accessToken, refreshToken);
    setToken(accessToken);
    setUser(userData);
    await setCrashlyticsUserId(getCrashlytics(), userData.id);

    // Link this device to the user in OneSignal and prompt for push
    // notifications immediately after login if not already granted.
    try {
      OneSignalService.login(userData.id);
      if (!(await OneSignalService.hasPermission())) {
        const granted = await OneSignalService.requestPermission();
        if (granted) {
          OneSignalService.optInToPush();
          OneSignalService.setTags({ push_notifications: 'true' });
        }
      }
    } catch (error) {
      // Non-fatal: notifications are optional and shouldn't block login.
    }
  };

  const sendMobileOtp = async (mobileNumber: string) => {
    const response = await makePublicRequest('/auth/mobile/send-otp', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber, tempToken }),
    });

    if (!response?.ok) {
      const error = await response?.json();
      throw new Error(error?.message || 'Failed to send OTP');
    }
  };

  const verifyMobileOtp = async (mobileNumber: string, otp: string) => {
    const response = await makePublicRequest('/auth/verify-mobile', {
      method: 'POST',
      body: JSON.stringify({ mobileNumber, otp, tempToken }),
    });

    if (!response?.ok) {
      const error = await response?.json();
      throw new Error(error?.message || 'Invalid OTP');
    }

    const data = await response.json();
    setTempToken(null);
    await handleAuthSuccess(data.accessToken, data.user, data.refreshToken);
    return { isNewUser: !!data.isNewUser };
  };

  const sendEmailOtp = async (email: string) => {
    const response = await makePublicRequest('/auth/email', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    if (!response?.ok) {
      const error = await response?.json();
      throw new Error(error?.message || 'Failed to send OTP');
    }
  };

  const verifyEmailOtp = async (email: string, otp: string) => {
    const response = await makePublicRequest('/auth/email/verify', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    });

    if (!response?.ok) {
      const error = await response?.json();
      throw new Error(error?.message || 'Invalid OTP');
    }

    const data = await response.json();

    if (data.requiresMobileVerification && data.tempToken) {
      // New user — store tempToken, login screen will show mobile step
      setTempToken(data.tempToken);
      return;
    }

    await handleAuthSuccess(data.accessToken, data.user, data.refreshToken);
  };

  const loginWithGoogle = async (idToken: string) => {
    const response = await makePublicRequest('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });

    if (!response?.ok) {
      const error = await response?.json();
      throw new Error(error?.message || 'Google login failed');
    }

    const data = await response.json();
    if (data.requiresMobileVerification) {
      setTempToken(data.tempToken);
      setUser(data.user);
      return;
    }
    await handleAuthSuccess(data.accessToken, data.user, data.refreshToken);
  };

  const loginWithApple = async (identityToken: string, authorizationCode: string) => {
    const response = await makePublicRequest('/auth/apple', {
      method: 'POST',
      body: JSON.stringify({ identityToken, authorizationCode }),
    });

    if (!response?.ok) {
      const error = await response?.json();
      throw new Error(error?.message || 'Apple login failed');
    }

    const data = await response.json();
    if (data.requiresMobileVerification) {
      setTempToken(data.tempToken);
      setUser(data.user);
      return;
    }
    await handleAuthSuccess(data.accessToken, data.user, data.refreshToken);
  };

  const loginWithCognito = async (idToken: string) => {
    const response = await makePublicRequest('/auth/cognito', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
    if (!response?.ok) {
      const error = await response?.json();
      throw new Error(error?.message || 'Cognito login failed');
    }
    const data = await response.json();
    if (data.requiresMobileVerification) {
      // Set tempToken and user - login screen will detect mobileVerified=false and show mobile step
      setTempToken(data.tempToken);
      setUser(data.user);
      return;
    }
    await handleAuthSuccess(data.accessToken, data.user, data.refreshToken);
  };

  const logout = async () => {
    // Detach the device server-side first — the DELETE needs the auth token.
    await unregisterPushDevice();
    try {
      OneSignalService.logout();
    } catch (error) {
      // Non-fatal.
    }
    await clearToken();
    setToken(null);
    setUser(null);
    // Wipe tickets off the home-screen widget; the Home tab may never remount to do it.
    await syncUpNextWidget(null);
    await setCrashlyticsUserId(getCrashlytics(), '');
  };

  const refreshUser = async () => {
    const response = await makeAuthenticatedRequest('/users/me');
    if (response?.ok) {
      const userData = await response.json();
      setUser(userData);
    }
  };

  const updateUser = (data: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...data } : null);
  };

  return (
    <AuthContext.Provider value={{
      user, token, isLoading,
      isAuthenticated: !!token && !!user,
      tempToken,
      sendMobileOtp, verifyMobileOtp,
      sendEmailOtp, verifyEmailOtp,
      loginWithGoogle, loginWithApple, loginWithCognito,
      logout, refreshUser, updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
