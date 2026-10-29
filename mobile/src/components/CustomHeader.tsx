import React from 'react';
import { View, StyleSheet, Platform, StatusBar, TouchableOpacity, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { MapPin } from '@unifesto/unicon/react-native';
import UnifestoAppWordmark from './UnifestoAppWordmark';
import { spacing, borderRadius, typography } from '../theme';
import { cosmosFont, useCosmos } from '../theme/cosmos';

export const HEADER_CONTENT_HEIGHT = 80;

// The safe-area top inset, hardened against the expo-router native tab host,
// which can momentarily report insets.top:0 on a freshly-mounted tab (sliding
// the header/content up under the notch). We Max() the live inset with the
// value measured natively at launch (and StatusBar height on Android) so every
// tab computes the SAME top inset and the header sits identically on every tab.
// Use this — not raw useSafeAreaInsets().top — for anything that positions
// content relative to the CustomHeader.
export function useStableTopInset(): number {
  const insets = useSafeAreaInsets();
  return Math.max(
    insets.top,
    initialWindowMetrics?.insets.top ?? 0,
    Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  );
}

// The header now scrolls inline with the page (it is the first child of each
// tab's ScrollView), so it occupies real layout space instead of floating. This
// helper is kept for the RefreshControl spinner offset: drop it just below the
// notch. Shared by Home, Tickets & Profile. Pass useStableTopInset().
export const headerClearance = (insetsTop: number) => insetsTop + HEADER_CONTENT_HEIGHT + 8;

interface CustomHeaderProps {
  detectedCity?: string | null;
  locationStatus?: 'idle' | 'loading' | 'granted' | 'denied';
  onEnableLocation?: () => void;
}

export default function CustomHeader({ detectedCity, locationStatus, onEnableLocation }: CustomHeaderProps = {}) {
  // Stable inset (see useStableTopInset) so the logo band lines up with the
  // scroll clearance identically on every tab.
  const topInset = useStableTopInset();
  const c = useCosmos();

  return (
    <View style={[styles.container, { height: topInset + HEADER_CONTENT_HEIGHT + 24 }]}>
      {/* Safe area spacer */}
      <View style={{ height: topInset }} />
      {/* Logo row with location control */}
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <UnifestoAppWordmark height={Platform.OS === 'android' ? 38 : 44} width={Platform.OS === 'android' ? 120 : 140} />
        </View>

        {/* Right side: Location control */}
        <View style={styles.rightActions}>
          {detectedCity ? (
            <View style={styles.locationPill}>
              <MapPin size={12} color={c.text} weight="fill" />
              <Text style={[styles.locationPillText, { color: c.text }]} numberOfLines={1}>
                {detectedCity}
              </Text>
            </View>
          ) : locationStatus === 'denied' ? (
            <TouchableOpacity
              style={styles.locationPill}
              onPress={onEnableLocation}
              activeOpacity={0.8}
            >
              <MapPin size={12} color={c.muted} />
              <Text style={[styles.locationPillText, { color: c.muted }]}>Enable</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {/* Gradient tail below logo */}
      <View style={{ height: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  content: {
    height: HEADER_CONTENT_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing[5],
  },
  logoContainer: {
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  rightActions: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 3,
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[1],
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[2],
    borderRadius: borderRadius.full,
    maxWidth: 140,
  },
  locationPillText: {
    fontSize: typography.fontSize.xs,
    fontFamily: cosmosFont.strong.fontFamily,
  },
});
