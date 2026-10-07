import React, { useEffect, useState } from 'react';
import { LogBox } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router';
import { DarkTheme, DefaultTheme } from 'expo-router/react-navigation';
import * as Font from 'expo-font';
import { getApp } from '@react-native-firebase/app';
import {
  getCrashlytics,
  recordError,
  setCrashlyticsCollectionEnabled,
} from '@react-native-firebase/crashlytics';
import { AuthProvider } from '../src/context/AuthContext';
import { FavoritesProvider } from '../src/context/FavoritesContext';
import { SpaceAccessProvider } from '../src/context/SpaceAccessContext';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import { stackHeaderDefaults } from '../src/navigation/stackHeader';
import { AppAlertHost } from '../src/components/ui/AppAlert';
import { InAppNoticeHost } from '../src/components/ui/InAppNotice';
import { ImageCropHost } from '../src/components/ui/ImageCropper';
import { OfflineBanner } from '../src/components/ui/OfflineBanner';
import ConsentManager from '../src/services/ConsentManager';
import { checkForAppUpdate } from '../src/lib/appUpdate';
import { startOtaUpdateChecks } from '../src/lib/otaUpdate';
import { tagCrashReports } from '../src/lib/appBuild';
import { showWhatsNewIfNeeded } from '../src/lib/whatsNew';
import { loadDefaultImages } from '../src/lib/defaultImages';
import { useDeepLinks } from '../src/hooks/useDeepLinks';
import { applyGlobalFont } from '../src/theme/globalFont';

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

// Make DM Sans the app-wide default for every Text/TextInput that doesn't
// explicitly pick another family. Runs once at module load, before any render.
applyGlobalFont();

// Crash reporting. Crashlytics collection is independent of Firebase Analytics
// (which stays deactivated for Apple ATT compliance) and is enabled explicitly here.
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    recordError(getCrashlytics(), error);
  }

  render() {
    return this.props.children;
  }
}

// Preload UnIcon assets
import { Asset } from 'expo-asset';


const preloadIcons = async () => {
  const icons: any[] = [];
  await Asset.loadAsync(icons as any[]);
};

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
          <Stack.Screen name="signup" options={{ headerShown: false }} />
          <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
        </Stack>
        </NavigationThemeProvider>
        </SpaceAccessProvider>
        <OfflineBanner />
        <InAppNoticeHost />
        <AppAlertHost />
        <ImageCropHost />
      </FavoritesProvider>
    </AuthProvider>
  );
}

preloadIcons().catch(() => {});

export default function RootLayout() {
  const [appIsReady, setAppIsReady] = useState(false);
  const [consentReady, setConsentReady] = useState(false);

  useEffect(() => {
    // Enable crash reporting (separate from analytics, ATT-safe).
    setCrashlyticsCollectionEnabled(getCrashlytics(), true).catch(() => {});
  }, []);

  useEffect(() => {
    async function initializeConsent() {
      try {
        await ConsentManager.initialize();
        setConsentReady(true);
      } catch (error) {
        console.error('[RootLayout] Consent initialization error:', error);
        setConsentReady(true);
      }
    }

    initializeConsent();
  }, []);

  useEffect(() => {
    async function prepare() {
      if (!consentReady) {
        return;
      }

      try {
        await Font.loadAsync({
          // Two families only — DM Sans (body, 400/500) + Plus Jakarta Sans
          // (headings, 500). Each weight is a distinct STATIC face registered
          // under its own family name; the theme `font(weight)` helper maps to
          // these names (RN can't drive a variable weight axis via fontWeight).
          'DMSans': require('../assets/fonts/dm-sans/static/dm-sans-latin-400-normal.ttf'),
          'DMSans-Medium': require('../assets/fonts/dm-sans/static/dm-sans-latin-500-normal.ttf'),
          'DMSans-SemiBold': require('../assets/fonts/dm-sans/static/dm-sans-latin-600-normal.ttf'),
          'DMSans-Bold': require('../assets/fonts/dm-sans/static/dm-sans-latin-700-normal.ttf'),
          'PlusJakartaSans-Medium': require('../assets/fonts/plus-jakarta-sans/static/PlusJakartaSans_500Medium.ttf'),
          // 2026 web brand (login screen): Michroma display + Hanken Grotesk text.
          'Michroma': require('../assets/fonts/michroma/Michroma-Regular.ttf'),
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
  }, [consentReady]);

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
    // After the store-update check has had its say, show release notes once.
    const t = setTimeout(() => void showWhatsNewIfNeeded(), 2500);
    return () => clearTimeout(t);
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
