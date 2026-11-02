import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { CaretRight, MagnifyingGlass, UsersThree, X } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useAuth } from '../context/AuthContext';
import useTopSpacing from '../hooks/useTopSpacing';
import { getSpaceById, getUserSpaces, type Space } from '../lib/api/spaces';
import { logoOr, useDefaultImages } from '../lib/defaultImages';
import { spaceLogo, spaceMembers } from '../utils/eventFormat';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import Skeleton from '../components/Skeleton';
import { GUTTER } from '../components/home/Section';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import { Monogram, compact, roleOf } from '../components/home/SpaceCards';
import { borderRadius, column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, cosmosRadius, useCosmos } from '../theme/cosmos';

const LOGO = 56;
/** Search only earns its place once the list stops fitting on a screen. */
const SEARCH_FROM = 7;

/**
 * Profile › My spaces: the spaces I belong to. The ones I run come first
 * (they're where I have work to do), then the ones I'm a member of, as rows
 * straight on the page (my role as plain text). Finding more closes the list in sky.
 */
export default function MySpacesScreen() {
  const router = useRouter();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const { token } = useAuth();

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [parents, setParents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    if (!token) return setLoading(false);
    try {
      const rows = await getUserSpaces();
      // One row per role comes back; keep one per space, preferring a real role over plain membership.
      const byId = new Map<string, Space>();
      for (const s of rows || []) {
        const prev = byId.get(s.id);
        if (!prev || (!roleOf(prev) && roleOf(s))) byId.set(s.id, s);
      }
      const list = [...byId.values()];
      setSpaces(list);

      // "Part of <parent>": names from my own list first, fetch only the rest.
      const known: Record<string, string> = Object.fromEntries(list.map((s) => [s.id, s.name]));
      const missing = [...new Set(list.map((s) => s.parentSpaceId).filter((id): id is string => !!id && !known[id]))];
      const fetched = await Promise.all(
        missing.map((id) => getSpaceById(id).then((p) => [id, p.name as string] as const).catch(() => null)),
      );
      setParents({ ...known, ...Object.fromEntries(fetched.filter((x): x is readonly [string, string] => !!x)) });
    } catch (error) {
      if (__DEV__) console.error('Error loading spaces:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Waits for the token to resolve from storage, otherwise it would load empty.
  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const { running, member } = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = (q ? spaces.filter((s) => s.name?.toLowerCase().includes(q) || s.city?.toLowerCase().includes(q)) : spaces)
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    return { running: shown.filter((s) => roleOf(s)), member: shown.filter((s) => !roleOf(s)) };
  }, [spaces, query]);

  const open = (s: Space) => router.push(`/space/${s.id}`);
  const row = (s: Space) => (
    <SpaceRow key={s.id} space={s} parent={s.parentSpaceId ? parents[s.parentSpaceId] : null} onPress={() => open(s)} />
  );
  const findMore = (
    <Pressable
      key="more"
      onPress={() => router.push('/spaces')}
      accessibilityRole="button"
      accessibilityLabel="Find more spaces"
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.slot}>
        <MagnifyingGlass size={24} color={c.sky} />
      </View>
      <Text style={[styles.name, { color: c.sky }]}>Find more spaces</Text>
    </Pressable>
  );

  const body = (() => {
    if (loading) {
      return (
        <SettingsGroup flat style={[styles.group, styles.first]}>
          {[0, 1, 2, 3].map((i) => <SpaceRowSkeleton key={i} />)}
        </SettingsGroup>
      );
    }
    if (spaces.length === 0) {
      return (
        <View style={styles.prompt}>
          <UsersThree size={40} color={c.muted} weight="duotone" />
          <Text style={[styles.promptTitle, { color: c.text }]} accessibilityRole="header">No spaces yet</Text>
          <Text style={[styles.promptBody, { color: c.muted }]}>
            Join a club or community to see its events first. The ones you join land here.
          </Text>
          <AuthButton label="Explore spaces" arrow onPress={() => router.push('/spaces')} style={{ marginTop: spacing[6] }} />
        </View>
      );
    }
    return (
      <>
        {spaces.length >= SEARCH_FROM ? (
          <View style={[styles.search, { backgroundColor: c.card, borderColor: c.input }]}>
            <MagnifyingGlass size={18} color={c.muted} />
            <TextInput
              style={[styles.searchInput, { color: c.text }]}
              placeholder="Search my spaces"
              placeholderTextColor={c.muted}
              selectionColor={c.primary}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              returnKeyType="search"
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
                <X size={16} color={c.muted} weight="bold" />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {running.length + member.length === 0 ? (
          <Text style={[styles.noMatch, { color: c.muted }]}>Nothing matches “{query.trim()}”.</Text>
        ) : null}

        {running.length > 0 ? (
          <SettingsGroup flat title="I run" style={[styles.group, styles.first]}>
            {running.map(row)}
            {member.length ? null : findMore}
          </SettingsGroup>
        ) : null}
        {member.length > 0 ? (
          <SettingsGroup flat title="Member of" style={[styles.group, !running.length && styles.first]}>
            {member.map(row)}
            {findMore}
          </SettingsGroup>
        ) : null}
      </>
    );
  })();

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={[column, { paddingTop: topSpacing, paddingBottom: 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} colors={[c.text]} progressViewOffset={topSpacing} />
        }
      >
        {body}
      </ScrollView>
    </View>
  );
}

/** One space row: 1:1 logo, name, my role, place · members · events, parent. */
function SpaceRow({ space, parent, onPress }: { space: Space; parent?: string | null; onPress: () => void }) {
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
        <Image source={{ uri: logo }} style={[styles.logo, { backgroundColor: c.card }]} contentFit="cover" />
      ) : (
        <Monogram name={space.name} size={LOGO} radius={borderRadius.md} />
      )}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>{space.name}</Text>
          {role ? <Text style={[styles.roleText, { color: c.muted }]} numberOfLines={1}>{role}</Text> : null}
        </View>
        <Text style={[styles.meta, { color: c.soft }]} numberOfLines={1}>{meta}</Text>
        {parent ? <Text style={[styles.meta, { color: c.muted }]} numberOfLines={1}>Part of {parent}</Text> : null}
      </View>
      <CaretRight size={15} color={c.muted} />
    </Pressable>
  );
}

function SpaceRowSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={LOGO} height={LOGO} borderRadius={borderRadius.md} />
      <View style={[styles.info, { gap: 8 }]}>
        <Skeleton width="70%" height={15} borderRadius={6} />
        <Skeleton width="50%" height={12} borderRadius={6} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  group: { marginHorizontal: GUTTER },
  // SettingsGroup's top margin is sized for a page of groups; tighter at the top.
  first: { marginTop: spacing[6] },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    height: 50,
    marginHorizontal: GUTTER,
    marginTop: spacing[4],
    paddingHorizontal: spacing[4],
    borderRadius: cosmosRadius,
    borderWidth: 1,
  },
  searchInput: { flex: 1, height: '100%', fontSize: typography.fontSize.base, ...cosmosFont.body },
  noMatch: { marginTop: spacing[8], textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  // Rows sit on the page: no side padding, SettingsGroup draws the full hairlines.
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing[4], paddingVertical: spacing[3] },
  logo: { width: LOGO, height: LOGO, borderRadius: borderRadius.md, overflow: 'hidden' },
  slot: { width: LOGO, alignItems: 'center' },
  info: { flex: 1, gap: 3 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  name: { flexShrink: 1, fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.strong },
  roleText: { flexShrink: 0, fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  meta: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  prompt: { marginHorizontal: GUTTER, marginTop: spacing[8] },
  promptTitle: { marginTop: spacing[5], fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  promptBody: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
});
