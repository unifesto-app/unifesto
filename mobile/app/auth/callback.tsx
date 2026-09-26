import { useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTokens } from '../../src/context/ThemeContext';
import BrandGlow from '../../src/components/ui/BrandGlow';
import { typography } from '../../src/theme/typography';
import { font } from '../../src/theme/fontHelpers';

export default function AuthCallback() {
  const router = useRouter();
  const tokens = useTokens();

  useEffect(() => {
    // expo-auth-session's WebBrowser.maybeCompleteAuthSession()
    // should intercept this before the router ever renders it.
    // This is a safety net in case the redirect escapes to the OS.
    const timeout = setTimeout(() => {
      router.replace('/login');
    }, 1500);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: tokens.bg }}>
      <BrandGlow />
      <ActivityIndicator color={tokens.accent} />
      <Text style={{ color: tokens.textSecondary, fontSize: typography.fontSize.sm, ...font('medium') }}>
        Signing you in
      </Text>
    </View>
  );
}
