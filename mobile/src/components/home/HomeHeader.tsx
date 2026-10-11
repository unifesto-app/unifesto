import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { MagnifyingGlass, MapPin, NavigationArrow, UserCircle } from '@unifesto/unicon/react-native';
import { useStableTopInset } from '../CustomHeader';
import type { LocationStatus } from '../../hooks/useHomeData';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';
import { GUTTER } from './Section';

// Brand wordmark PNG is 2400×551.
const MARK_W = 112;
const MARK_H = Math.round((MARK_W * 551) / 2400);
const AVATAR = 36;

interface HomeHeaderProps {
  /** First name when signed in ('' if none yet); null for guests (no avatar). */
  firstName: string | null;
  avatarUrl?: string | null;
  city: string | null;
  locationStatus: LocationStatus;
  onEnableLocation: () => void;
  onPressAvatar: () => void;
  onPressSearch: () => void;
}

/**
 * Home masthead in the web's layout: wordmark left with place + me on the
 * right (like the site's navbar), then a Michroma headline and the search
 * field. Scrolls inline with the page (not sticky), so it's content layer:
 * solid fills, no Liquid Glass (glass is for floating chrome only).
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
  const c = useCosmos();
  const topInset = useStableTopInset();

  return (
    <View style={{ paddingTop: topInset + spacing[3], paddingHorizontal: GUTTER }}>
      <View style={styles.bar}>
        <Image
          source={c.scheme === 'dark' ? require('../../../assets/brand/wordmark-silver.png') : require('../../../assets/brand/wordmark-ink.png')}
          style={{ width: MARK_W, height: MARK_H }}
          contentFit="contain"
          accessibilityLabel="Unifesto"
        />

        <View style={styles.barRight}>
          {city ? (
            // Plain label, not a chip: it isn't tappable, so it shouldn't look like a control.
            <View style={styles.place}>
              <MapPin size={14} color={c.soft} weight="fill" />
              <Text style={[styles.chipText, { color: c.soft }]} numberOfLines={1}>{city}</Text>
            </View>
          ) : locationStatus === 'denied' ? (
            <Pressable
              onPress={onEnableLocation}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Use my location"
              // Scale, not opacity: opacity breaks Liquid Glass.
              style={({ pressed }) => [
                styles.chip,
                { borderColor: c.border, backgroundColor: c.card, transform: [{ scale: pressed ? 0.96 : 1 }] },
              ]}
            >
              <NavigationArrow size={13} color={c.muted} weight="fill" />
              <Text style={[styles.chipText, { color: c.muted }]}>Set location</Text>
            </Pressable>
          ) : null}

          {firstName !== null ? (
            <Pressable
              onPress={onPressAvatar}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              style={({ pressed }) => [styles.avatar, { borderColor: c.outline, backgroundColor: c.card, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFill} />
              ) : firstName ? (
                <Text style={[styles.avatarText, { color: c.text }]}>{firstName.charAt(0).toUpperCase()}</Text>
              ) : (
                <UserCircle size={22} color={c.text} />
              )}
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={[styles.headline, { color: c.text }]}>
        What's on{city ? ` in ${city}` : ''}?
      </Text>

      <Pressable
        onPress={onPressSearch}
        accessibilityRole="search"
        accessibilityLabel="Search events and spaces"
        style={({ pressed }) => [
          styles.search,
          { borderColor: c.input, backgroundColor: c.card, transform: [{ scale: pressed ? 0.985 : 1 }] },
        ]}
      >
        <MagnifyingGlass size={18} color={c.muted} />
        <Text style={[styles.searchText, { color: c.muted }]}>Search events, spaces, vibes</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, gap: spacing[3] },
  barRight: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], flexShrink: 1 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    minHeight: 32,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    maxWidth: 150,
  },
  place: { flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 150, flexShrink: 1 },
  chipText: { fontSize: typography.fontSize.sm, flexShrink: 1, ...cosmosFont.strong },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 15, ...cosmosFont.strong },
  // Michroma has one weight and runs wide: 28px fits "What's on in Hyderabad?" in two lines.
  headline: { marginTop: spacing[8], fontSize: 28, lineHeight: 36, ...cosmosFont.display },
  search: {
    marginTop: spacing[6],
    minHeight: 52,
    paddingVertical: spacing[3],
    borderRadius: cosmosRadius,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
  },
  searchText: { fontSize: typography.fontSize.base, ...cosmosFont.body },
});
