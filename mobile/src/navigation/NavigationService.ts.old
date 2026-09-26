/**
 * Navigation Service
 * 
 * Allows navigation to be triggered from anywhere in the app,
 * including contexts and services that don't have direct access
 * to the navigation object.
 */

import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

/**
 * Navigate to a specific route
 */
export function navigate(name: string, params?: any) {
  if (navigationRef.isReady()) {
    // @ts-ignore - Dynamic navigation requires type assertion
    navigationRef.navigate(name, params);
  } else {
  }
}

/**
 * Reset navigation stack to auth flow (login screen)
 */
export function resetToAuth() {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'AuthLoading' }],
      })
    );
  } else {
  }
}

/**
 * Go back to previous screen
 */
export function goBack() {
  if (navigationRef.isReady() && navigationRef.canGoBack()) {
    navigationRef.goBack();
  }
}

/**
 * Check if navigation is ready
 */
export function isReady() {
  return navigationRef.isReady();
}
