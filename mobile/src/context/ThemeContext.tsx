import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { colors as darkColors, lightColors } from '../theme/colors';
import { darkTokens, lightTokens, type Tokens } from '../theme/tokens';

/** What the user picked in Appearance. `system` follows the OS setting. */
export type ThemePreference = 'light' | 'dark' | 'system';
export type ActiveTheme = 'light' | 'dark';

interface ThemeContextType {
  /** The user's choice (persisted). */
  theme: ThemePreference;
  /** What is actually rendered right now. */
  activeTheme: ActiveTheme;
  isDark: boolean;
  setTheme: (theme: ThemePreference) => void;
  /** Legacy palette — kept for screens not yet migrated to `tokens`. */
  colors: typeof darkColors;
  /** Semantic tokens — use these in new/migrated code (src/components/ui). */
  tokens: Tokens;
}

const STORAGE_KEY = 'unifesto.themePreference';
const DEFAULT_PREFERENCE: ThemePreference = 'system';

const ThemeContext = createContext<ThemeContextType>({
  theme: DEFAULT_PREFERENCE,
  activeTheme: 'dark',
  isDark: true,
  setTheme: () => {},
  colors: darkColors,
  tokens: darkTokens,
});

const isPreference = (v: unknown): v is ThemePreference =>
  v === 'light' || v === 'dark' || v === 'system';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(DEFAULT_PREFERENCE);
  const [hydrated, setHydrated] = useState(false);
  const systemScheme = useColorScheme();

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (isPreference(stored)) setThemeState(stored);
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
  }, []);

  // Pin native chrome (menus, alerts, keyboard, the iOS tab bar's glass) to the
  // choice. `unspecified` hands control back to the OS, which is also what lets
  // useColorScheme() report the real system value again after a forced mode.
  useEffect(() => {
    Appearance.setColorScheme(theme === 'system' ? 'unspecified' : theme);
  }, [theme]);

  const setTheme = useCallback((next: ThemePreference) => {
    setThemeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const activeTheme: ActiveTheme =
    theme === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : theme;

  const value = useMemo<ThemeContextType>(() => {
    const isDark = activeTheme === 'dark';
    return {
      theme,
      activeTheme,
      isDark,
      setTheme,
      colors: isDark ? darkColors : lightColors,
      tokens: isDark ? darkTokens : lightTokens,
    };
  }, [theme, activeTheme, setTheme]);

  // One AsyncStorage read (~ms) so a saved Light choice never flashes dark.
  if (!hydrated) return null;

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={value.isDark ? 'light' : 'dark'} />
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Shorthand for components that only need the semantic tokens. */
export function useTokens(): Tokens {
  return useContext(ThemeContext).tokens;
}

export default ThemeContext;
