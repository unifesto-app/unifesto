import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { MagnifyingGlass, MapPin, NavigationArrow } from 'phosphor-react-native';
import { GlassView } from 'expo-glass-effect';
import { useTheme } from '../../context/ThemeContext';
import { GlassFill, LIQUID_GLASS } from '../ui/CardSurface';
import { useStableTopInset } from '../CustomHeader';
import UnifestoAppWordmark from '../UnifestoAppWordmark';
import type { LocationStatus } from '../../hooks/useHomeData';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { GUTTER } from './Section';
import { greeting } from '../../utils/eventFormat';

interface HomeHeaderProps {
  /** First name when signed in; null for guests (shows the wordmark instead). */
  firstName: string | null;
  avatarUrl?: string | null;
  city: string | null;
  locationStatus: LocationStatus;
  onEnableLocation: () => void;
  onPressAvatar: () => void;
  onPressSearch: () => void;
}

/**
 * Personal header for Home: who you are + where you are on one line, then a
 * big search entry point. Scrolls inline with the page (not sticky).
 */
export default function HomeHeader({
  firstName,
  avatarUrl,
  city,
  locationStatus,
  onEnableLocation,
  onPressAvatar,
  onPressSearch,
}: HomeHeaderProps) {
  const { tokens, isDark } = useTheme();
  const topInset = useStableTopInset();

  return (
    <View style={{ paddingTop: topInset + spacing[3], paddingHorizontal: GUTTER }}>
      <View style={styles.row}>
        {firstName ? (
          <Pressable
            onPress={onPressAvatar}
            style={styles.identity}
            accessibilityRole="button"
            accessibilityLabel="Open profile"
          >
            <View style={[styles.avatar, { backgroundColor: tokens.elevated, borderColor: tokens.border }]}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} />
              ) : (
                <Text style={[styles.avatarText, { color: tokens.text }]}>{firstName.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text style={[styles.greeting, { color: tokens.textMuted }]}>{greeting()}</Text>
              <Text style={[styles.name, { color: tokens.text }]} numberOfLines={1}>{firstName}</Text>
            </View>
          </Pressable>
        ) : (
          <UnifestoAppWordmark width={124} height={38} />
        )}

        {city ? (
          <View style={[styles.locationPill, LIQUID_GLASS ? { borderWidth: 0 } : { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
            <GlassFill />
            <MapPin size={13} color={tokens.accent} weight="fill" />
            <Text style={[styles.locationText, { color: tokens.text }]} numberOfLines={1}>{city}</Text>
          </View>
        ) : locationStatus === 'denied' ? (
          <Pressable
            onPress={onEnableLocation}
            accessibilityRole="button"
            accessibilityLabel="Use my location"
            style={({ pressed }) => [
              styles.locationPill,
              LIQUID_GLASS
                ? { borderWidth: 0, transform: [{ scale: pressed ? 0.96 : 1 }] }
                : { backgroundColor: tokens.surface, borderColor: tokens.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <GlassFill interactive />
            <NavigationArrow size={13} color={tokens.textSecondary} weight="fill" />
            <Text style={[styles.locationText, { color: tokens.textSecondary }]}>Set location</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={[styles.headline, { color: tokens.text }]}>
        What's on{city ? ` in ${city}` : ''}?
      </Text>

      <Pressable
        onPress={onPressSearch}
        accessibilityRole="search"
        accessibilityLabel="Search events and spaces"
        style={({ pressed }) => [
          styles.search,
          LIQUID_GLASS
            ? { borderWidth: 0, transform: [{ scale: pressed ? 0.98 : 1 }] } // opacity would break the glass
            : { backgroundColor: tokens.surface, borderColor: tokens.border, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        {LIQUID_GLASS ? (
          <GlassView
            glassEffectStyle="regular"
            colorScheme={isDark ? 'dark' : 'light'}
            isInteractive
            style={[StyleSheet.absoluteFill, { borderRadius: borderRadius.full }]}
            pointerEvents="none"
          />
        ) : null}
        <MagnifyingGlass size={20} color={tokens.textSecondary} />
        <Text style={[styles.searchText, { color: tokens.textMuted }]}>Search events, spaces, vibes</Text>
      </Pressable>
    </View>
  );
}

const AVATAR = 42;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48, gap: spacing[3] },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], flexShrink: 1 },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 18, ...font('heading') },
  greeting: { fontSize: typography.fontSize.sm, ...font() },
  name: { fontSize: typography.fontSize.lg, ...font('semibold') },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    maxWidth: 160,
  },
  locationText: { fontSize: typography.fontSize.sm, ...font('medium') },
  headline: {
    marginTop: spacing[6],
    fontSize: typography.fontSize['4xl'],
    lineHeight: typography.fontSize['4xl'] * 1.1,
    letterSpacing: -0.8,
    ...font('heading'),
  },
  search: {
    marginTop: spacing[5],
    height: 54,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[5],
  },
  searchText: { fontSize: typography.fontSize.base, ...font() },
});
