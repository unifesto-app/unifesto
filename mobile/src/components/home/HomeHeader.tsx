import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { MagnifyingGlass, MapPin, NavigationArrow, UserCircle } from 'phosphor-react-native';
import { GlassFill, LIQUID_GLASS } from '../ui/CardSurface';
import { useStableTopInset } from '../CustomHeader';
import type { LocationStatus } from '../../hooks/useHomeData';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, cosmosRadius, useCosmos } from '../../theme/cosmos';
import { GUTTER } from './Section';
import { greeting } from '../../utils/eventFormat';

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
 * field. Scrolls inline with the page (not sticky).
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
  const chip = [styles.chip, LIQUID_GLASS ? null : { borderWidth: 1, borderColor: c.border, backgroundColor: c.card }];

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
            <View style={chip}>
              <GlassFill />
              <MapPin size={13} color={c.text} weight="fill" />
              <Text style={[styles.chipText, { color: c.text }]} numberOfLines={1}>{city}</Text>
            </View>
          ) : locationStatus === 'denied' ? (
            <Pressable
              onPress={onEnableLocation}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Use my location"
              // Scale, not opacity: opacity breaks Liquid Glass.
              style={({ pressed }) => [chip, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
            >
              <GlassFill interactive />
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

      <Text style={[styles.greeting, { color: c.muted }]}>
        {firstName ? `${greeting()}, ${firstName}` : greeting()}
      </Text>
      <Text style={[styles.headline, { color: c.text }]}>
        What's on{city ? ` in ${city}` : ''}?
      </Text>

      <Pressable
        onPress={onPressSearch}
        accessibilityRole="search"
        accessibilityLabel="Search events and spaces"
        style={({ pressed }) => [
          styles.search,
          { borderColor: c.input, backgroundColor: LIQUID_GLASS ? undefined : c.card, transform: [{ scale: pressed ? 0.985 : 1 }] },
        ]}
      >
        <GlassFill radius={cosmosRadius} interactive />
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
    height: 32,
    borderRadius: borderRadius.full,
    maxWidth: 150,
  },
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
  greeting: { marginTop: spacing[8], fontSize: typography.fontSize.base, ...cosmosFont.body },
  // Michroma has one weight and runs wide: 28px fits "What's on in Hyderabad?" in two lines.
  headline: { marginTop: spacing[2], fontSize: 28, lineHeight: 36, ...cosmosFont.display },
  search: {
    marginTop: spacing[6],
    height: 52,
    borderRadius: cosmosRadius,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingHorizontal: spacing[4],
  },
  searchText: { fontSize: typography.fontSize.base, ...cosmosFont.body },
});
