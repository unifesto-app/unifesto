import React, { useEffect, useState } from 'react';
import { LogBox, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { DarkTheme, DefaultTheme } from 'expo-router/react-navigation';
import * as Font from 'expo-font';
import { getApp } from '@react-native-firebase/app';
import {
  getCrashlytics,
  log,
  recordError,
  setCrashlyticsCollectionEnabled,
} from '@react-native-firebase/crashlytics';
import { AuthProvider } from '../src/context/AuthContext';
import LegalAcceptSheet from '../src/components/LegalAcceptSheet';
import WhatsNewSheet, { showWhatsNewIfNeeded } from '../src/components/WhatsNewSheet';
import { FavoritesProvider } from '../src/context/FavoritesContext';
import { SpaceAccessProvider } from '../src/context/SpaceAccessContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { stackHeaderDefaults } from '../src/navigation/stackHeader';
import { AppAlertHost } from '../src/components/ui/AppAlert';
import { InAppNoticeHost } from '../src/components/ui/InAppNotice';
import { ImageCropHost } from '../src/components/ui/ImageCropper';
import { OfflineBanner } from '../src/components/ui/OfflineBanner';
import OneSignalService from '../src/services/OneSignalService';
import { checkForAppUpdate } from '../src/lib/appUpdate';
import { startOtaUpdateChecks } from '../src/lib/otaUpdate';
import { tagCrashReports } from '../src/lib/appBuild';
import { loadDefaultImages } from '../src/lib/defaultImages';
import { useDeepLinks } from '../src/hooks/useDeepLinks';
import { darkTokens, lightTokens } from '../src/theme/tokens';
import { cosmosRadius } from '../src/theme/cosmos';

// Dev-only noise filter. On the New Architecture every native-driven core
// Animated animation (TouchableOpacity presses, React Navigation transitions)
// emits "Sending `onAnimatedValueUpdate` with no listeners registered", a known,
// harmless React Native warning that floods Metro. Drop just that message.
//
// It's a *native* RCTLogWarn, so it reaches JS via RCTLog's warning handler,
// which LogBox points at a function that prints with the console.warn it
// captured at install time, before this file runs. Patching console.warn alone
// misses it, so the RCTLog handler is replaced too and routed back through the
// (filtered) console.warn, which still feeds LogBox for every other warning.
//
// RCTLog has no public export, hence the deep import. Babel appends a
// "Deep imports ... deprecated" console.warn to the end of this module for it,
// which lands after the patch below, so that one exact message is dropped too.
if (__DEV__) {
  const NOISE = [
    'Sending `onAnimatedValueUpdate` with no listeners registered',
    "Deep imports from the 'react-native' package are deprecated ('react-native/Libraries/Utilities/RCTLog')",
  ];
  const isNoise = (args: unknown[]) =>
    typeof args[0] === 'string' && NOISE.some((n) => (args[0] as string).includes(n));
  LogBox.ignoreLogs(NOISE);
  const warn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (isNoise(args)) return;
    warn(...args);
  };
  const RCTLog = require('react-native/Libraries/Utilities/RCTLog').default as {
    setWarningHandler(handler: (...args: unknown[]) => void): void;
  };
  RCTLog.setWarningHandler((...args: unknown[]) => {
    if (!isNoise(args)) console.warn(...args);
  });
}

// Crash reporting. Crashlytics collection is independent of Firebase Analytics
// (which stays deactivated for Apple ATT compliance) and is enabled explicitly here.
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Last-resort catch for a render crash anywhere below: reports it to
 * Crashlytics as a non-fatal and shows a retry screen instead of a blank app.
 * Sits outside ThemeProvider (which may be what threw), so it reads the
 * system scheme directly.
 */
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    const crashlytics = getCrashlytics();
    if (info.componentStack) log(crashlytics, `componentStack: ${info.componentStack.slice(0, 1000)}`);
    recordError(crashlytics, error, 'RootErrorBoundary');
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return <CrashFallback onRetry={() => this.setState({ hasError: false })} />;
  }
}

function CrashFallback({ onRetry }: { onRetry: () => void }) {
  const t = useColorScheme() === 'light' ? lightTokens : darkTokens;
  return (
    <View style={[crashStyles.root, { backgroundColor: t.bg }]}>
      <Text style={[crashStyles.title, { color: t.text }]}>Something went wrong</Text>
      <Text style={[crashStyles.body, { color: t.textMuted }]}>
        The app hit a problem showing this screen. It has been reported.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [crashStyles.button, { backgroundColor: t.accent, opacity: pressed ? 0.8 : 1 }]}
      >
        <Text style={[crashStyles.buttonText, { color: t.accentFg }]}>Try again</Text>
      </Pressable>
    </View>
  );
}

const crashStyles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: 24 },
  // System fonts on purpose: this can render before the brand fonts load.
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: cosmosRadius },
  buttonText: { fontSize: 16, fontWeight: '600' },
});

// Runs the deep-link wiring inside AuthProvider (useDeepLinks needs useAuth).
function DeepLinkBridge() {
  useDeepLinks();
  return null;
}

function RootStack() {
  const { tokens, isDark } = useTheme();

  // Navigation theme. native-stack forces every header (bar buttons, iOS 26
  // glass, the ⋯ UIMenu) to this theme's `dark` flag via
  // experimental_userInterfaceStyle, so it must track the active theme.
  const base = isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    dark: isDark,
    colors: {
      ...base.colors,
      primary: tokens.accent,
      background: tokens.bg,
      card: tokens.bg,
      text: tokens.text,
      border: 'transparent',
      notification: tokens.accent,
    },
  };

  return (
    <AuthProvider>
      <DeepLinkBridge />
      <FavoritesProvider>
        <SpaceAccessProvider>
        <NavigationThemeProvider value={navigationTheme}>
        <Stack
          screenOptions={{
            // Screens opt in with `headerShown: true` + a title; everything
            // else about the header is shared (transparent, fade, back button).
            headerShown: false,
            ...stackHeaderDefaults(tokens),
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        </Stack>
        </NavigationThemeProvider>
        <WhatsNewSheet />
        </SpaceAccessProvider>
        <OfflineBanner />
        <InAppNoticeHost />
        <AppAlertHost />
        <ImageCropHost />
        <LegalAcceptSheet />
      </FavoritesProvider>
    </AuthProvider>
  );
}

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    // Enable crash reporting (separate from analytics, ATT-safe).
    setCrashlyticsCollectionEnabled(getCrashlytics(), true).catch(() => {});
    // Push is a core feature (tickets, updates), not tracking: start it at launch.
    OneSignalService.initialize();
  }, []);

  useEffect(() => {
    async function prepare() {
      try {
        await Font.loadAsync({
          // Cosmos type (theme/cosmos.ts): DM Sans for headlines (500) and
          // figures (600), Hanken Grotesk for text (400, 600). Each weight is a
          // distinct STATIC face registered under its own family name (RN can't
          // drive a variable weight axis via fontWeight).
          'DMSans-Medium': require('../assets/fonts/dm-sans/static/dm-sans-latin-500-normal.ttf'),
          'DMSans-SemiBold': require('../assets/fonts/dm-sans/static/dm-sans-latin-600-normal.ttf'),
          'HankenGrotesk': require('../assets/fonts/hanken-grotesk/HankenGrotesk-Regular.ttf'),
          'HankenGrotesk-SemiBold': require('../assets/fonts/hanken-grotesk/HankenGrotesk-SemiBold.ttf'),
        });
      } catch (e) {
        console.error('[RootLayout] Font loading error:', e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  // Once the UI is up, check the store for a newer version and prompt if needed.
  // Fire-and-forget: checkForAppUpdate swallows its own failures so a bad
  // network never keeps the user out of the app.
  useEffect(() => {
    if (!appIsReady) return;
    checkForAppUpdate();
    // Crash reports carry the exact build + OTA update that was running.
    tagCrashReports();
    // Stand-in banners/logos for events and spaces without their own.
    void loadDefaultImages();
    // Release notes once per version (opens after the store-update check has had its say).
    void showWhatsNewIfNeeded();
  }, [appIsReady]);

  // OTA JS updates: also check when returning to the foreground (see otaUpdate.ts).
  useEffect(() => startOtaUpdateChecks(), []);

  // Don't render anything until app is ready
  if (!appIsReady) {
    return null;
  }

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <RootStack />
        </ThemeProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
