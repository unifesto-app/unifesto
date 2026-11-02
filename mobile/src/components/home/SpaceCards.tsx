import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { Space } from '../../lib/api/spaces';
import Skeleton from '../Skeleton';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';
import { GUTTER } from './Section';
import { spaceBanner, spaceLogo, spaceMembers } from '../../utils/eventFormat';
import { coverOr, logoOr, useDefaultImages } from '../../lib/defaultImages';
import { CaretRight } from '@unifesto/unicon/react-native';
import { SPACE_ROLE_LABEL } from '../../lib/api/spaceMembers';
import PressableScale from '../ui/PressableScale';
import { SettingsGroup } from '../profile/SettingsGroup';

const CARD_W = 148;
// Space banners are 4:3; logos are 1:1.
const LOGO = 44;
const RING = 3;
// My spaces rows.
const ROW_LOGO = 48;
/** Home shows this many of my spaces; See all opens the full list. */
const HOME_SPACES = 3;

export function Monogram({ name, size, radius }: { name: string; size: number; radius: number }) {
  const c = useCosmos();
  return (
    <LinearGradient
      colors={c.fallback}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: radius, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ fontSize: size * 0.36, color: c.text, ...cosmosFont.strong }}>{name.charAt(0).toUpperCase()}</Text>
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
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={space.name}
      style={[{ width }]}
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
    </PressableScale>
  );
}

/** 1.2k-style counts so stats fit a narrow card. */
export function compact(n: number): string {
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
export function roleOf(space: Space): string | null {
  // /users/me/spaces sends a flat { code, name }; the type still models the nested one.
  const r = space.userRole as { code?: string; role?: { code?: string } } | null | undefined;
  const code = r?.code ?? r?.role?.code;
  return code && code !== 'MEMBER' ? (SPACE_ROLE_LABEL[code] ?? null) : null;
}

/** One of my spaces as a row on the page: 1:1 logo, name, my role, place · members · events, parent. */
export function SpaceRow({ space, parent, onPress }: { space: Space; parent?: string | null; onPress: () => void }) {
  const c = useCosmos();
  const defaults = useDefaultImages();
  const logo = logoOr(defaults, space.id, spaceLogo(space));
  const role = roleOf(space);
  const members = spaceMembers(space);
  const events = space._count?.events ?? space.event_count ?? 0;
  const meta = [
    space.city,
    `${compact(members)} ${members === 1 ? 'member' : 'members'}`,
    `${compact(events)} ${events === 1 ? 'event' : 'events'}`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[space.name, role, meta].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      {logo ? (
        <Image source={{ uri: logo }} style={[styles.rowLogo, { backgroundColor: c.card }]} contentFit="cover" />
      ) : (
        <Monogram name={space.name} size={ROW_LOGO} radius={borderRadius.md} />
      )}
      <View style={styles.rowInfo}>
        <View style={styles.rowTitle}>
          <Text style={[styles.rowName, { color: c.text }]} numberOfLines={1}>{space.name}</Text>
          {role ? <Text style={[styles.rowRole, { color: c.muted }]} numberOfLines={1}>{role}</Text> : null}
        </View>
        <Text style={[styles.rowMeta, { color: c.soft }]} numberOfLines={1}>{meta}</Text>
        {parent ? <Text style={[styles.rowMeta, { color: c.muted }]} numberOfLines={1}>Part of {parent}</Text> : null}
      </View>
      <CaretRight size={15} color={c.muted} />
    </Pressable>
  );
}

export function SpaceRowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={ROW_LOGO} height={ROW_LOGO} borderRadius={borderRadius.md} />
      <View style={[styles.rowInfo, { gap: 8 }]}>
        <Skeleton width="70%" height={15} borderRadius={6} />
        <Skeleton width="50%" height={12} borderRadius={6} />
      </View>
    </View>
  );
}

/**
 * "My spaces" on Home and a person's profile: the first few as rows on the
 * page with full hairlines, like Up next. The section's See all opens the rest.
 */
export function MySpacesRows({
  spaces,
  loading,
  onPress,
}: {
  spaces: Space[];
  loading: boolean;
  onPress: (space: Space) => void;
}) {
  return (
    <SettingsGroup flat style={styles.rows}>
      {loading && spaces.length === 0
        ? [0, 1].map((i) => <SpaceRowSkeleton key={i} />)
        : spaces.slice(0, HOME_SPACES).map((s) => <SpaceRow key={s.id} space={s} onPress={() => onPress(s)} />)}
    </SettingsGroup>
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
  statValue: { fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.figure },
  statLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  // Under a Home section title, so no group margin on top.
  rows: { marginTop: 0, marginHorizontal: GUTTER },
  // Rows sit on the page: no side padding, SettingsGroup draws the full hairlines.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], paddingVertical: spacing[3] },
  rowLogo: { width: ROW_LOGO, height: ROW_LOGO, borderRadius: borderRadius.md, overflow: 'hidden' },
  rowInfo: { flex: 1, gap: 3 },
  rowTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  rowName: { flexShrink: 1, fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.strong },
  rowRole: { flexShrink: 0, fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  rowMeta: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
