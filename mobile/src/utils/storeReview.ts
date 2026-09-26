import * as StoreReview from 'expo-store-review';
import { Platform, Linking } from 'react-native';
import { AppAlert } from '../components/ui/AppAlert';

/**
 * Request an in-app review from the user
 * This will show the native review modal on supported platforms
 * @returns Promise that resolves when the review flow is complete
 */
export const requestReview = async (): Promise<void> => {
  try {
    const hasAction = await StoreReview.hasAction();
    
    if (hasAction) {
      await StoreReview.requestReview();
    } else {
      // Fallback to store URL if native review is not available
      await openStoreReview();
    }
  } catch (error) {
    if (__DEV__) console.error('Error requesting review:', error);
    // Fallback to store URL on error
    await openStoreReview();
  }
};

/**
 * Open the app's store page for the user to write a review
 * @returns Promise that resolves when the store page is opened
 */
export const openStoreReview = async (): Promise<void> => {
  const storeUrl = Platform.select({
    ios: 'https://apps.apple.com/in/app/unifesto-discover-events/id6767165496?action=write-review',
    android: 'https://play.google.com/store/apps/details?id=com.unifesto.app&showAllReviews=true',
  });

  if (!storeUrl) {
    AppAlert.alert('Error', 'Store URL not available for this platform');
    return;
  }

  try {
    await Linking.openURL(storeUrl);
  } catch (error) {
    if (__DEV__) console.error('Error opening store review:', error);
    AppAlert.alert('Error', 'Failed to open store page');
  }
};

/**
 * Check if the platform supports in-app reviews
 * @returns Promise that resolves to true if the platform supports native reviews
 */
export const isReviewAvailable = async (): Promise<boolean> => {
  try {
    return await StoreReview.isAvailableAsync();
  } catch (error) {
    if (__DEV__) console.error('Error checking review availability:', error);
    return false;
  }
};

/**
 * Get the store URL for the current platform
 * @returns The store URL or null if not available
 */
export const getStoreUrl = (): string | null => {
  return StoreReview.storeUrl();
};
