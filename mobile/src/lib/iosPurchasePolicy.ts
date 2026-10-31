import { Platform } from 'react-native';

/**
 * App Store 3.1.1: paid access to live online content (online events) is a
 * digital service, which iOS only allows through In-App Purchase. We don't sell
 * through IAP, so these can't be bought in the iOS app. Free ones, in-person
 * and hybrid events, and joining something bought elsewhere still work. Every
 * paid online path asks this one function so the rule can't drift.
 */
export function isIosDigitalPurchaseBlocked(price: number | string | null | undefined): boolean {
  return Platform.OS === 'ios' && Number(price) > 0;
}
