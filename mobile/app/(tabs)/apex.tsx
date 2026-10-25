import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import ApexScreen from '../../src/screens/ApexScreen';
import { useCosmos } from '../../src/theme/cosmos';
import usePlatformAdmin from '../../src/hooks/usePlatformAdmin';

// Platform-admin tab (Apex). Hidden for everyone else by the tab layouts via
// usePlatformAdmin(). Same thin opaque wrapper as the other tabs so the native
// tab host doesn't double the safe-area top inset.
export default function ApexTab() {
  const c = useCosmos();
  const router = useRouter();
  const isPlatformAdmin = usePlatformAdmin();

  // Reached without the role (deep link, role revoked): leave for Home.
  useEffect(() => {
    if (!isPlatformAdmin) router.navigate('/(tabs)');
  }, [isPlatformAdmin, router]);

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      {isPlatformAdmin ? <ApexScreen /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
