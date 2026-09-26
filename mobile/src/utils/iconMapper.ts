/**
 * Icon Mapper Utility
 * 
 * Maps SF Symbols (iOS) to Material Icons (Android)
 * Provides a unified interface for cross-platform icon usage
 */

export type IconName = 
  | 'person.circle.fill'
  | 'creditcard.fill'
  | 'gift.fill'
  | 'bell.fill'
  | 'lock.shield.fill'
  | 'paintpalette.fill'
  | 'message.fill'
  | 'house'
  | 'house.fill'
  | 'magnifyingglass'
  | 'wallet.bifold'
  | 'wallet.bifold.fill'
  | 'chevron.right'
  | 'chevron.left'
  | 'rectangle.portrait.and.arrow.right'
  | 'checkmark.circle.fill'
  | 'xmark.circle.fill'
  | 'calendar'
  | 'clock'
  | 'location.fill'
  | 'star.fill'
  | 'heart.fill'
  | 'ticket.fill';

/**
 * SF Symbol to Material Icon mapping
 */
export const SF_TO_MATERIAL: Record<IconName, string> = {
  'person.circle.fill': 'account-circle',
  'creditcard.fill': 'credit-card',
  'gift.fill': 'card-giftcard',
  'bell.fill': 'notifications',
  'lock.shield.fill': 'security',
  'paintpalette.fill': 'palette',
  'message.fill': 'message',
  'house': 'home-outline',
  'house.fill': 'home',
  'magnifyingglass': 'search',
  'wallet.bifold': 'account-balance-wallet-outline',
  'wallet.bifold.fill': 'account-balance-wallet',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'rectangle.portrait.and.arrow.right': 'exit-to-app',
  'checkmark.circle.fill': 'check-circle',
  'xmark.circle.fill': 'cancel',
  'calendar': 'event',
  'clock': 'schedule',
  'location.fill': 'location-on',
  'star.fill': 'star',
  'heart.fill': 'favorite',
  'ticket.fill': 'confirmation-number',
};

/**
 * Get Material Icon name from SF Symbol name
 */
export function getMaterialIcon(sfSymbol: IconName): string {
  return SF_TO_MATERIAL[sfSymbol] || 'help-outline';
}

/**
 * Icon color mapping for consistency
 */
export const ICON_COLORS = {
  primary: '#3491ff',
  secondary: '#666666',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  purple: '#8b5cf6',
  pink: '#ec4899',
  white: '#ffffff',
  black: '#000000',
};

/**
 * Get icon color by name
 */
export function getIconColor(colorName: keyof typeof ICON_COLORS): string {
  return ICON_COLORS[colorName];
}
