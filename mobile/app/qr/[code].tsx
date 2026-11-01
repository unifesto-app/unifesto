import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../src/context/AuthContext';
import { AppAlert } from '../../src/components/ui/AppAlert';
import CosmosBackdrop from '../../src/components/ui/CosmosBackdrop';
import { confirmDeviceLink } from '../../src/screens/LinkDeviceScreen';
import { useCosmos } from '../../src/theme/cosmos';

/**
 * unifesto.app/qr/{code}: web's sign-in QR, opened by the phone's own camera.
 * Same question as the Link a device scanner, then back to wherever I was.
 * Signed out, I sign in first and come straight back here.
 */
export default function QrSignInRoute() {
  const c = useCosmos();
  const code = String(useLocalSearchParams<{ code: string }>().code ?? '');
  const { token, isLoading } = useAuth();
  const signedIn = !!token;

  useEffect(() => {
    if (isLoading) return;
    if (!signedIn) return void router.replace({ pathname: '/login', params: { redirect: `/qr/${code}` } });
    const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
    confirmDeviceLink(code).then(leave, (e: any) =>
      AppAlert.alert("Couldn't sign that computer in", e.message, [{ text: 'OK', onPress: leave }]),
    );
  }, [code, isLoading, signedIn]);

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <Stack.Screen options={{ title: 'Sign in a computer', headerShown: true }} />
      <CosmosBackdrop horizon={false} />
      <ActivityIndicator color={c.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
