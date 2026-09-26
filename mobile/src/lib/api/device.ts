/**
 * ⚠️ NON-FUNCTIONAL: Backend device-management endpoints do not exist.
 *
 * The functions in this module (`registerDevice`, `getUserDevices`,
 * `removeDevice`, `logoutOtherDevices`) call `POST/GET/DELETE /auth/devices`
 * and `POST /auth/devices/logout-others`, but the backend `auth` controller
 * only exposes: google, apple, cognito, email, email/verify,
 * mobile/send-otp, verify-mobile, session, logout.
 *
 * These functions are currently unused anywhere in the app. Calling them will
 * fail at runtime (404). Do NOT wire them into UI until the corresponding
 * backend routes are implemented. Device push registration is handled by
 * OneSignalService instead.
 */
import { getToken } from './helpers';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { API_URL } from '../constants';

// Track active abort controllers to cancel requests on logout
const activeRequests = new Set<AbortController>();

/**
 * Get authorization header with current session token
 * Returns null if no active session
 */
const getAuthHeaders = async (): Promise<{ 'Authorization': string; 'Content-Type': string } | null> => {
  const token = await getToken();
  
  if (!token) {
    return null;
  }

  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

/**
 * Cancel all active device API requests
 * Call this when user logs out
 */
export const cancelAllDeviceRequests = () => {
  activeRequests.forEach(controller => controller.abort());
  activeRequests.clear();
};

/**
 * Handle 401 Unauthorized responses from the API.
 * Cancels pending device requests but does NOT automatically sign out.
 * The AuthContext will handle session validation and logout if needed.
 */
const handleUnauthorized = async (message?: string) => {
  
  // Cancel pending requests to avoid repeated 401s
  try {
    cancelAllDeviceRequests();
  } catch (e) {
  }

  // Check if session is actually invalid before logging out
  try {
    const token = await getToken();
    
    if (!token) {
    } else {
      // Don't automatically log out - let AuthContext handle it
      // The user might still have a valid session
    }
  } catch (e) {
  }

  throw new Error(message ? `Unauthorized - ${message}` : 'Unauthorized');
};

/**
 * Generate a unique device fingerprint
 * Retry logic ensures we get a valid ID even if APIs timeout
 */
export const generateDeviceFingerprint = async (): Promise<string> => {
  let deviceId = 'unknown';
  
  try {
    if (Platform.OS === 'ios') {
      // iOS: Use vendor ID with timeout
      try {
        const idForVendor = await Promise.race<string | null>([
          Application.getIosIdForVendorAsync(),
          new Promise<null>((_, reject) => 
            setTimeout(() => reject(new Error('iOS vendor ID timeout')), 3000)
          ),
        ]);
        
        if (idForVendor) {
          deviceId = idForVendor;
        } else {
          deviceId = Constants.sessionId || 'unknown';
        }
      } catch (error) {
        deviceId = Constants.sessionId || 'unknown';
      }
    } else if (Platform.OS === 'android') {
      // Android: Use Android ID with permission check
      try {
        const androidId = Application.getAndroidId ? Application.getAndroidId() : undefined;
        if (androidId && androidId !== 'unknown') {
          deviceId = androidId;
        } else {
          deviceId = Constants.sessionId || 'unknown';
        }
      } catch (error) {
        deviceId = Constants.sessionId || 'unknown';
      }
    } else {
      // Web or other platforms
      deviceId = Constants.sessionId || 'unknown';
    }
  } catch (error) {
    deviceId = Constants.sessionId || 'unknown';
  }
  
  const model = Device.modelName || 'unknown';
  const os = Platform.OS;
  
  // Create a unique fingerprint
  const fingerprint = `${os}-${model}-${deviceId}`.toLowerCase().replace(/\s+/g, '-');
  return fingerprint;
};

/**
 * Get device information
 */
export const getDeviceInfo = async () => {
  const deviceType = Device.deviceType;
  let type: 'ios' | 'android' | 'web' | 'desktop' | 'unknown' = 'unknown';
  
  if (Platform.OS === 'ios') {
    type = 'ios';
  } else if (Platform.OS === 'android') {
    type = 'android';
  } else if (Platform.OS === 'web') {
    type = 'web';
  }
  
  const deviceName = Device.deviceName || `${Device.brand} ${Device.modelName}` || 'Unknown Device';
  const deviceModel = Device.modelName || undefined;
  const osVersion = Device.osVersion || undefined;
  const appVersion = Application.nativeApplicationVersion || undefined;
  
  // Get OneSignal device token if available
  let deviceToken: string | undefined;
  try {
    // Try to get OneSignal player ID (device token)
    // This will be available if OneSignal is initialized
    try {
      const OneSignal = (globalThis as any).OneSignal;
      if (OneSignal && typeof OneSignal.getDeviceState === 'function') {
        const deviceState = await OneSignal.getDeviceState();
        if (deviceState && deviceState.userId) {
          deviceToken = deviceState.userId;
        }
      }
    } catch (error) {
    }
  } catch (error) {
  }
  
  // If OneSignal token not available, generate a unique token
  if (!deviceToken) {
    deviceToken = await generateDeviceToken();
  }
  
  return {
    device_name: deviceName,
    device_type: type,
    device_model: deviceModel,
    os_version: osVersion,
    app_version: appVersion,
    device_token: deviceToken,
  };
};

/**
 * Generate a unique device token (fallback if OneSignal unavailable)
 * Used for push notifications and device identification
 */
export const generateDeviceToken = async (): Promise<string> => {
  try {
    // Get device ID
    let deviceId = 'unknown';
    
    try {
      if (Platform.OS === 'ios') {
        // iOS: Use vendor ID with timeout
        const idForVendor = await Promise.race<string | null>([
          Application.getIosIdForVendorAsync(),
          new Promise<null>((_, reject) => 
            setTimeout(() => reject(new Error('timeout')), 2000)
          ),
        ]);
        deviceId = idForVendor || Constants.sessionId || 'unknown';
      } else if (Platform.OS === 'android') {
        // Android: Use Android ID
        const androidId = Application.getAndroidId ? Application.getAndroidId() : undefined;
        deviceId = androidId || Constants.sessionId || 'unknown';
      } else {
        deviceId = Constants.sessionId || 'unknown';
      }
    } catch (error) {
      // Fall back to session ID if device-specific ID unavailable
      deviceId = Constants.sessionId || Math.random().toString(36).substr(2, 9);
    }
    
    // Combine device info to create unique token
    const model = Device.modelName || 'unknown';
    const os = Platform.OS;
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    
    // Create a unique token: timestamp-os-model-deviceid-random
    const token = `${timestamp}-${os}-${model}-${deviceId}-${random}`
      .toLowerCase()
      .replace(/\s+/g, '-')
      .substring(0, 100); // Limit length to 100 chars
    
    return token;
  } catch (error) {
    // Last-resort fallback token
    const fallback = `token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return fallback;
  }
};

/**
 * Register current device with backend
 */
export const registerDevice = async (retries = 3): Promise<any> => {
  try {
    const deviceInfo = await getDeviceInfo();
    const fingerprint = await generateDeviceFingerprint();
    const headers = await getAuthHeaders();
    
    // If no headers (no session), don't attempt the request
    if (!headers) {
      throw new Error('No active session - user is logged out');
    }
    
    const response = await fetch(`${API_URL}/auth/devices`, {
      method: 'POST',
      headers: headers as HeadersInit,
      body: JSON.stringify({
        ...deviceInfo,
        device_fingerprint: fingerprint,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      // Retry on 401 errors (session not ready yet)
      if (response.status === 401 && retries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        return registerDevice(retries - 1);
      }

      if (response.status === 401) {
        await handleUnauthorized(errorData?.message || undefined);
      }

      throw new Error(errorData.message || 'Failed to register device');
    }

    const data = await response.json();
    return data.device;
  } catch (error) {
    throw error;
  }
};

/**
 * Get all user devices
 */
export const getUserDevices = async (retries = 1): Promise<any[]> => {
  try {
    const headers = await getAuthHeaders();
    
    // If no headers (no session), don't attempt the request
    if (!headers) {
      throw new Error('No active session - user is logged out');
    }
    
    const abortController = new AbortController();
    activeRequests.add(abortController);
    
    const url = `${API_URL}/auth/devices`;
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: abortController.signal,
      });


      if (!response.ok) {
        const errorText = await response.text().catch(() => undefined);

        // Handle 401 - might be a race condition, retry once
        if (response.status === 401 && retries > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return getUserDevices(retries - 1);
        }
        
        if (response.status === 401) {
          await handleUnauthorized(errorText);
        }

        throw new Error(`Failed to fetch devices: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return data.devices || [];
    } finally {
      activeRequests.delete(abortController);
    }
  } catch (error: any) {
    // Ignore abort errors (expected when user logs out)
    if (error.name === 'AbortError') {
      return [];
    }
    
    throw error;
  }
};

/**
 * Remove a device
 */
export const removeDevice = async (deviceId: string): Promise<void> => {
  try {
    const headers = await getAuthHeaders();
    
    // If no headers (no session), don't attempt the request
    if (!headers) {
      throw new Error('No active session - user is logged out');
    }
    
    const abortController = new AbortController();
    activeRequests.add(abortController);
    
    const url = `${API_URL}/auth/devices/${deviceId}`;
    
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers,
        signal: abortController.signal,
      });


      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Handle 401 - user session is invalid
        if (response.status === 401) {
          await handleUnauthorized(errorData?.message || undefined);
        }

        throw new Error(errorData.message || 'Failed to remove device');
      }

      const data = await response.json();
    } finally {
      activeRequests.delete(abortController);
    }
  } catch (error: any) {
    // Ignore abort errors
    if (error.name === 'AbortError') {
      return;
    }
    
    throw error;
  }
};

/**
 * Logout from all other devices
 */
export const logoutOtherDevices = async (currentDeviceId: string): Promise<number> => {
  try {
    const headers = await getAuthHeaders();
    
    // If no headers (no session), don't attempt the request
    if (!headers) {
      throw new Error('No active session - user is logged out');
    }
    
    const abortController = new AbortController();
    activeRequests.add(abortController);
    
    const url = `${API_URL}/auth/devices/logout-others`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          current_device_id: currentDeviceId,
        }),
        signal: abortController.signal,
      });


      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Handle 401 - user session is invalid
        if (response.status === 401) {
          await handleUnauthorized(errorData?.message || undefined);
        }

        throw new Error(errorData.message || 'Failed to logout other devices');
      }

      const data = await response.json();
      return data.count || 0;
    } finally {
      activeRequests.delete(abortController);
    }
  } catch (error: any) {
    // Ignore abort errors
    if (error.name === 'AbortError') {
      return 0;
    }
    
    throw error;
  }
};

/**
 * Check if current device is still active
 * Returns true if device is active, false if it has been removed
 */
export const checkDeviceStatus = async (): Promise<boolean> => {
  try {
    const fingerprint = await generateDeviceFingerprint();
    const devices = await getUserDevices();
    
    // Find current device by fingerprint
    const currentDevice = devices.find(d => d.device_fingerprint === fingerprint);
    
    // If device not found or marked as inactive, return false
    if (!currentDevice || !currentDevice.is_active) {
      return false;
    }
    
    return true;
  } catch (error) {
    // On error, assume device is active to avoid false logouts
    return true;
  }
};
