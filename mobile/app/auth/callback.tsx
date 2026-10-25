import { useEffect } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import BrandGlow from '../../src/components/ui/BrandGlow';
import { typography } from '../../src/theme/typography';
import { cosmosFont, useCosmos } from '../../src/theme/cosmos';

export default function AuthCallback() {
  const router = useRouter();
  const c = useCosmos();

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
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, backgroundColor: c.bg }}>
      <BrandGlow />
      <ActivityIndicator color={c.primary} />
      <Text style={{ color: c.soft, fontSize: typography.fontSize.sm, ...cosmosFont.strong }}>
        Signing you in
      </Text>
    </View>
  );
}
