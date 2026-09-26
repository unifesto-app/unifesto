import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useTokens } from '../../context/ThemeContext';
import type { Space } from '../../lib/api/spaces';
import Skeleton from '../Skeleton';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';
import { GUTTER } from './Section';
import { spaceBanner, spaceLogo, spaceMembers } from '../../utils/eventFormat';

const CARD_W = 148;
const AVATAR = 64;
// Space banners are 4:3; logos are 1:1.
const LOGO = 44;
const RING = 3;

function Monogram({ name, size, radius }: { name: string; size: number; radius: number }) {
  const tokens = useTokens();
  return (
    <LinearGradient
      colors={tokens.accentGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontSize: size * 0.4, color: '#fff', ...font('heading') }}>{name.charAt(0).toUpperCase()}</Text>
    </LinearGradient>
  );
}

interface SpaceCardProps {
  space: Space;
  onPress: () => void;
  /** Card width; the 4:3 banner scales with it. Defaults to the rail size. */
  width?: number;
  /** Shown under the meta line, e.g. "Part of JNTU". */
  context?: string | null;
}

/**
 * A miniature of the Space detail header: 4:3 banner, 1:1 logo overlapping its
 * lower edge in a page-coloured ring, name, place · visibility, bare stats.
 */
export function SpaceCard({ space, onPress, width = CARD_W, context }: SpaceCardProps) {
  const tokens = useTokens();
  const banner = spaceBanner(space);
  const logo = spaceLogo(space);
  const members = spaceMembers(space);
  const events = space._count?.events ?? space.event_count ?? null;
  const bannerH = Math.round((width * 3) / 4);
  const meta = [space.city, space.visibility === 'PRIVATE' ? 'Private' : 'Public'].filter(Boolean).join(' · ');
  const stats = [
    { label: members === 1 ? 'Member' : 'Members', value: members },
    ...(events != null ? [{ label: events === 1 ? 'Event' : 'Events', value: events }] : []),
  ];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={space.name}
      style={({ pressed }) => [{ width, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <View style={[styles.banner, { height: bannerH, backgroundColor: tokens.elevated }]}>
        {banner ? (
          <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={[tokens.accent, tokens.accentStrong]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
      </View>
      <View style={[styles.logoWrap, { backgroundColor: tokens.bg }]}>
        {logo ? (
          <Image source={{ uri: logo }} style={[styles.logo, { backgroundColor: tokens.elevated }]} contentFit="cover" />
        ) : (
          <Monogram name={space.name} size={LOGO} radius={borderRadius.md} />
        )}
      </View>

      <Text style={[styles.name, { color: tokens.text }]} numberOfLines={2}>{space.name}</Text>
      <Text style={[styles.meta, { color: tokens.textSecondary }]} numberOfLines={1}>{meta}</Text>
      {context ? (
        <Text style={[styles.meta, { color: tokens.textMuted }]} numberOfLines={1}>{context}</Text>
      ) : null}

      {/* Numbers: bare, no tiles — same as the detail header */}
      <View style={styles.stats}>
        {stats.map((st) => (
          <View key={st.label}>
            <Text style={[styles.statValue, { color: tokens.text }]}>{compact(st.value)}</Text>
            <Text style={[styles.statLabel, { color: tokens.textMuted }]}>{st.label}</Text>
          </View>
        ))}
      </View>
    </Pressable>
  );
}

/** 1.2k-style counts so stats fit a narrow card. */
function compact(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${k >= 10 ? Math.round(k) : k.toFixed(1).replace(/\.0$/, '')}k`;
}

export function SpaceCardSkeleton({ width = CARD_W }: { width?: number }) {
  return (
    <View style={{ width }}>
      <Skeleton width={width} height={Math.round((width * 3) / 4)} borderRadius={borderRadius.xl} />
      <Skeleton width={LOGO} height={LOGO} borderRadius={borderRadius.md} style={{ marginTop: -LOGO / 2, marginLeft: spacing[3] }} />
      <Skeleton width={width * 0.8} height={14} borderRadius={6} style={{ marginTop: spacing[2] }} />
      <Skeleton width={width * 0.5} height={11} borderRadius={6} style={{ marginTop: 6 }} />
      <Skeleton width={width * 0.6} height={26} borderRadius={6} style={{ marginTop: spacing[3] }} />
    </View>
  );
}

/** Story-style row of circular logos for the spaces you belong to. */
export function CircleRow({ spaces, loading, onPress }: { spaces: Space[]; loading: boolean; onPress: (space: Space) => void }) {
  const tokens = useTokens();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.circleRow}>
      {loading
        ? [0, 1, 2, 3].map((i) => (
            <View key={i} style={styles.circleItem}>
              <Skeleton width={AVATAR} height={AVATAR} borderRadius={AVATAR / 2} />
              <Skeleton width={52} height={10} borderRadius={5} style={{ marginTop: 8 }} />
            </View>
          ))
        : spaces.map((space) => {
            const logo = spaceLogo(space);
            return (
              <Pressable
                key={space.id}
                onPress={() => onPress(space)}
                accessibilityRole="button"
                accessibilityLabel={space.name}
                style={({ pressed }) => [styles.circleItem, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[styles.ring, { borderColor: tokens.borderStrong }]}>
                  {logo ? (
                    <Image source={{ uri: logo }} style={styles.circleImg} contentFit="cover" />
                  ) : (
                    <Monogram name={space.name} size={AVATAR - 8} radius={(AVATAR - 8) / 2} />
                  )}
                </View>
                <Text style={[styles.circleName, { color: tokens.textSecondary }]} numberOfLines={1}>
                  {space.name}
                </Text>
              </Pressable>
            );
          })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  banner: { width: '100%', borderRadius: borderRadius.xl, overflow: 'hidden' },
  logoWrap: {
    marginTop: -LOGO / 2 - RING,
    marginLeft: spacing[3],
    alignSelf: 'flex-start',
    padding: RING,
    borderRadius: borderRadius.md + RING,
  },
  logo: { width: LOGO, height: LOGO, borderRadius: borderRadius.md, overflow: 'hidden' },
  name: {
    marginTop: spacing[2],
    fontSize: typography.fontSize.base,
    lineHeight: typography.fontSize.base * 1.2,
    ...font('heading'),
  },
  meta: { marginTop: 2, fontSize: typography.fontSize.xs, ...font() },
  stats: { flexDirection: 'row', gap: spacing[5], marginTop: spacing[3] },
  statValue: { fontSize: typography.fontSize.lg, lineHeight: typography.fontSize.lg * 1.15, ...font('heading') },
  statLabel: { fontSize: typography.fontSize.xs, ...font() },
  circleRow: { paddingHorizontal: GUTTER, gap: spacing[4] },
  circleItem: { width: AVATAR + 8, alignItems: 'center' },
  ring: {
    width: AVATAR + 4,
    height: AVATAR + 4,
    borderRadius: (AVATAR + 4) / 2,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleImg: { width: AVATAR - 4, height: AVATAR - 4, borderRadius: (AVATAR - 4) / 2 },
  circleName: { marginTop: 6, fontSize: typography.fontSize.xs, textAlign: 'center', ...font('medium') },
});
