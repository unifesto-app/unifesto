import React from 'react';
import AuthButton from './AuthButton';
import BrandIcon from '../profile/BrandIcon';

type Provider = 'apple' | 'google';

interface SocialAuthButtonProps {
  provider: Provider;
  onPress: () => void;
  disabled?: boolean;
}

/**
 * Full-width provider button on the brand's hairline outline, so the silver
 * fill stays reserved for the one primary action. Apple's mark follows the
 * text colour; Google keeps its four-colour G.
 */
export default function SocialAuthButton({ provider, onPress, disabled }: SocialAuthButtonProps) {
  const isApple = provider === 'apple';
  return (
    <AuthButton
      variant="secondary"
      label={`Continue with ${isApple ? 'Apple' : 'Google'}`}
      icon={<BrandIcon brand={provider} size={20} />}
      onPress={onPress}
      disabled={disabled}
    />
  );
}

