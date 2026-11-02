import type { ComponentType } from 'react';
import type { ViewProps } from 'react-native';
import { requireNativeView, requireOptionalNativeModule } from 'expo';

export type ApplePayButtonProps = ViewProps & {
  /** 'plain' = the Apple Pay mark alone; 'buy' = "Buy with Apple Pay". */
  type?: 'plain' | 'buy';
  radius?: number;
  onPress?: () => void;
};

/**
 * Apple's own Apple Pay button (PKPaymentButton). null on Android, and on
 * builds made before it: an update over the air can reach those.
 */
export const ApplePayButton: ComponentType<ApplePayButtonProps> | null = requireOptionalNativeModule('ApplePayButton')
  ? requireNativeView<ApplePayButtonProps>('ApplePayButton')
  : null;
