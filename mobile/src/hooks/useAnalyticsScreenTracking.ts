/**
 * Custom hook for automatic screen tracking with Firebase Analytics
 * 
 * Usage:
 * import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
 * 
 * function MyScreen() {
 *   useAnalyticsScreenTracking('MyScreen');
 *   // ... rest of component
 * }
 */

import { useEffect } from 'react';
import FirebaseAnalyticsService from '../services/FirebaseAnalyticsService';

export default function useAnalyticsScreenTracking(screenName: string, screenClass?: string) {
  useEffect(() => {
    // Log screen view when component mounts
    FirebaseAnalyticsService.logScreenView(screenName, screenClass);
  }, [screenName, screenClass]);
}
