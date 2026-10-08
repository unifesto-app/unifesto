import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { Space } from '../../lib/api/spaces';
import Skeleton from '../Skeleton';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import { GlassFill, LIQUID_GLASS } from '../ui/CardSurface';
import { GUTTER } from './Section';
import { spaceBanner, spaceLogo, spaceMembers } from '../../utils/eventFormat';
import { coverOr, logoOr, useDefaultImages } from '../../lib/defaultImages';
import { ArrowRight } from '@unifesto/unicon/react-native';
import { SPACE_ROLE_LABEL } from '../manage/MemberRow';

const CARD_W = 148;
// Space banners are 4:3; logos are 1:1.
const LOGO = 44;
const RING = 3;
// My circles tiles.
const TILE_W = 164;
const TILE_LOGO = 48;

function Monogram({ name, size, radius }: { name: string; size: number; radius: number }) {
  const c = useCosmos();
  return (
    <LinearGradient
      colors={c.fallback}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontSize: size * 0.36, color: c.text, ...cosmosFont.display }}>{name.charAt(0).toUpperCase()}</Text>
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
  const c = useCosmos();
  const defaults = useDefaultImages();
  const banner = coverOr(defaults, space.id, spaceBanner(space));
  const logo = logoOr(defaults, space.id, spaceLogo(space));
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
      <View style={[styles.banner, { height: bannerH, backgroundColor: c.card }]}>
        {banner ? (
          <Image source={{ uri: banner }} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : (
          <LinearGradient colors={c.fallback} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        )}
      </View>
      <View style={[styles.logoWrap, { backgroundColor: c.bg }]}>
        {logo ? (
          <Image source={{ uri: logo }} style={[styles.logo, { backgroundColor: c.card }]} contentFit="cover" />
        ) : (
          <Monogram name={space.name} size={LOGO} radius={borderRadius.md} />
        )}
      </View>

      <Text style={[styles.name, { color: c.text }]} numberOfLines={2}>{space.name}</Text>
      <Text style={[styles.meta, { color: c.soft }]} numberOfLines={1}>{meta}</Text>
      {context ? (
        <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>{context}</Text>
      ) : null}

      {/* Numbers: bare, no tiles — same as the detail header */}
      <View style={styles.stats}>
        {stats.map((st) => (
          <View key={st.label}>
            <Text style={[styles.statValue, { color: c.text }]}>{compact(st.value)}</Text>
            <Text style={[styles.statLabel, { color: c.muted }]}>{st.label}</Text>
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
      <Skeleton width={width} height={Math.round((width * 3) / 4)} borderRadius={cosmosCardRadius} />
      <Skeleton width={LOGO} height={LOGO} borderRadius={borderRadius.md} style={{ marginTop: -LOGO / 2, marginLeft: spacing[3] }} />
      <Skeleton width={width * 0.8} height={14} borderRadius={6} style={{ marginTop: spacing[2] }} />
      <Skeleton width={width * 0.5} height={11} borderRadius={6} style={{ marginTop: 6 }} />
      <Skeleton width={width * 0.6} height={26} borderRadius={6} style={{ marginTop: spacing[3] }} />
    </View>
  );
}

/** My role in a space, when it's more than plain membership. */
function roleOf(space: Space): string | null {
  // /users/me/spaces sends a flat { code, name }; the type still models the nested one.
  const r = space.userRole as { code?: string; role?: { code?: string } } | null | undefined;
  const code = r?.code ?? r?.role?.code;
  return code && code !== 'MEMBER' ? (SPACE_ROLE_LABEL[code] ?? null) : null;
}

/**
 * "My circles": a rail of membership tiles. Logo and my role up top, then the
 * name, place · members, and the event count in Michroma, closing with a
 * dashed "Find more circles" tile so the row always leads somewhere.
 */
export function CircleRow({
  spaces,
  loading,
  onPress,
  onFindMore,
}: {
  spaces: Space[];
  loading: boolean;
  onPress: (space: Space) => void;
  onFindMore: () => void;
}) {
  const c = useCosmos();
  const defaults = useDefaultImages();

  if (loading && spaces.length === 0) {
    return (
      <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tileRow}>
        {[0, 1].map((i) => (
          <View key={i} style={[styles.tile, { backgroundColor: LIQUID_GLASS ? undefined : c.raised }]}>
            <GlassFill radius={cosmosCardRadius} />
            <Skeleton width={TILE_LOGO} height={TILE_LOGO} borderRadius={14} />
            <Skeleton width={TILE_W * 0.7} height={14} borderRadius={6} style={{ marginTop: spacing[4] }} />
            <Skeleton width={TILE_W * 0.5} height={11} borderRadius={6} style={{ marginTop: 8 }} />
            <Skeleton width={TILE_W * 0.35} height={14} borderRadius={6} style={{ marginTop: spacing[5] }} />
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tileRow}>
      {spaces.map((space) => {
        const logo = logoOr(defaults, space.id, spaceLogo(space));
        const role = roleOf(space);
        const members = spaceMembers(space);
        const events = space._count?.events ?? space.event_count ?? 0;
        const meta = [space.city, `${compact(members)} ${members === 1 ? 'member' : 'members'}`].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={space.id}
            onPress={() => onPress(space)}
            accessibilityRole="button"
            accessibilityLabel={role ? `${space.name}, ${role}` : space.name}
            style={({ pressed }) => [styles.tile, { backgroundColor: LIQUID_GLASS ? undefined : c.raised, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
          >
            <GlassFill radius={cosmosCardRadius} />
            <View style={styles.tileTop}>
              {logo ? (
                <Image source={{ uri: logo }} style={[styles.tileLogo, { backgroundColor: c.card }]} contentFit="cover" />
              ) : (
                <Monogram name={space.name} size={TILE_LOGO} radius={14} />
              )}
              {role ? (
                <View style={[styles.role, { backgroundColor: c.tint }]}>
                  <Text style={[styles.roleText, { color: c.text }]}>{role}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.tileName, { color: c.text }]} numberOfLines={2}>{space.name}</Text>
            <Text style={[styles.tileMeta, { color: c.muted }]} numberOfLines={1}>{meta}</Text>
            <View style={styles.tileFoot}>
              <Text style={[styles.tileCount, { color: c.text }]}>{compact(events)}</Text>
              <Text style={[styles.tileMeta, { color: c.muted }]}>{events === 1 ? 'event' : 'events'}</Text>
            </View>
          </Pressable>
        );
      })}

      <Pressable
        onPress={onFindMore}
        accessibilityRole="button"
        accessibilityLabel="Find more circles"
        style={({ pressed }) => [styles.tile, styles.more, { borderColor: c.outline, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
      >
        <Text style={[styles.moreTitle, { color: c.text }]}>Find more circles</Text>
        <Text style={[styles.tileMeta, { color: c.muted, marginTop: 6 }]}>Clubs and communities near you</Text>
        <ArrowRight size={18} color={c.text} style={{ marginTop: spacing[4] }} />
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  banner: { width: '100%', borderRadius: cosmosCardRadius, overflow: 'hidden' },
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
    ...cosmosFont.strong,
  },
  meta: { marginTop: 2, fontSize: typography.fontSize.xs, ...cosmosFont.body },
  stats: { flexDirection: 'row', gap: spacing[5], marginTop: spacing[3] },
  statValue: { fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.display },
  statLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  tileRow: { paddingHorizontal: GUTTER, gap: spacing[3] },
  tile: { width: TILE_W, borderRadius: cosmosCardRadius, padding: spacing[4] },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing[2] },
  tileLogo: { width: TILE_LOGO, height: TILE_LOGO, borderRadius: 14, overflow: 'hidden' },
  role: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, flexShrink: 1 },
  roleText: { fontSize: 11, ...cosmosFont.strong },
  tileName: { marginTop: spacing[4], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.25, ...cosmosFont.strong },
  tileMeta: { marginTop: 3, fontSize: typography.fontSize.xs, ...cosmosFont.body },
  // Pinned to the bottom so counts line up across tiles with one- and two-line names.
  tileFoot: { marginTop: 'auto', paddingTop: spacing[4], flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  tileCount: { fontSize: 16, ...cosmosFont.display },
  more: { borderWidth: 1, borderStyle: 'dashed', justifyContent: 'center' },
  moreTitle: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
});
