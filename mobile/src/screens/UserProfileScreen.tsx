import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useRouter } from 'expo-router';
import { ArrowUpRight, UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import { useAuth } from '../context/AuthContext';
import * as AuthAPI from '../lib/api/auth';
import { getMyRegisteredEvents, type Event } from '../lib/api/events';
import { getUserSpaces, type Space } from '../lib/api/spaces';
import { isEventOver } from '../lib/upcomingTickets';
import { coverOr, useDefaultImages } from '../lib/defaultImages';
import useTopSpacing from '../hooks/useTopSpacing';
import Skeleton from '../components/Skeleton';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import { Rail, Section, GUTTER } from '../components/home/Section';
import PosterCard, { PosterCardSkeleton } from '../components/home/PosterCard';
import { CircleRow } from '../components/home/SpaceCards';
import { relativeWhen } from '../utils/eventFormat';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import { AppAlert } from '../components/ui/AppAlert';

const AVATAR = 96;

const LINKS: { key: keyof AuthAPI.User; icon: GlyphName; label: string }[] = [
  { key: 'linkedinUrl', icon: 'linkedin-logo', label: 'LinkedIn' },
  { key: 'instagramUrl', icon: 'instagram-logo', label: 'Instagram' },
  { key: 'githubUrl', icon: 'github-logo', label: 'GitHub' },
  { key: 'websiteUrl', icon: 'globe', label: 'Website' },
];

/** People type "github.com/me" as often as the full URL. */
const toUrl = (raw: string) => (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase() || '·';

/**
 * "View profile": the signed-in user's own profile as others would see it.
 * Identity up top (avatar, name, handle, bio, links), a few bare numbers,
 * then what they're going to, where they've been and the circles they're in.
 */
export default function UserProfileScreen() {
  const router = useRouter();
  const c = useCosmos();
  const defaults = useDefaultImages();
  const topSpacing = useTopSpacing();
  const { user, token } = useAuth();

  const [profile, setProfile] = useState<AuthAPI.User | null>(null);
  const [upcoming, setUpcoming] = useState<Event[]>([]);
  const [past, setPast] = useState<Event[]>([]);
  const [circles, setCircles] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingCircles, setLoadingCircles] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user || !token) {
      router.back();
      return;
    }
    const profileTask = AuthAPI.getCurrentUser()
      .then(setProfile)
      .catch(() => AppAlert.alert('Error', 'Failed to load profile'))
      .finally(() => setLoading(false));

    const eventsTask = getMyRegisteredEvents(1, 50)
      .then((resp) => {
        const regs = resp?.data || resp?.events || [];
        const all: Event[] = regs.map((r: any) => (r.event ? r.event : r)).filter((e: any) => e?.id);
        // One card per event even if registered twice (e.g. a group + own ticket).
        const unique = all.filter((e, i) => all.findIndex((x) => x.id === e.id) === i);
        const at = (e: Event) => new Date(e.startDateTime).getTime();
        // Same rule as Tickets: going to until the event ends.
        setUpcoming(unique.filter((e) => !isEventOver(e)).sort((a, b) => at(a) - at(b)));
        setPast(unique.filter((e) => isEventOver(e)).sort((a, b) => at(b) - at(a)));
      })
      .catch(() => {})
      .finally(() => setLoadingEvents(false));

    // A space can come back once per role; one tile each.
    const circlesTask = getUserSpaces()
      .then((s) => setCircles((s || []).filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i)))
      .catch(() => {})
      .finally(() => setLoadingCircles(false));

    await Promise.all([profileTask, eventsTask, circlesTask]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, token]);

  // Refresh on focus so edits made in Edit profile show when coming back.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const name = profile?.fullName || profile?.username || 'My profile';
  const joined = profile?.createdAt
    ? `Since ${new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`
    : null;
  const links = profile ? LINKS.filter((l) => !!profile[l.key]) : [];

  const stats = [
    { label: 'Going to', value: upcoming.length, loading: loadingEvents },
    { label: 'Been to', value: past.length, loading: loadingEvents },
    { label: 'Circles', value: circles.length, loading: loadingCircles },
  ];

  const poster = (e: Event) => (
    <PosterCard
      key={e.id}
      title={e.title}
      imageUrl={coverOr(defaults, e.id, e.coverImageUrl)}
      when={relativeWhen(e.startDateTime)}
      where={e.venueName || e.city || (e.type === 'ONLINE' ? 'Online' : null)}
      host={e.space?.name}
      tag={e.categories?.[0] || e.category}
      onPress={() => router.push(`/event/${e.slug || e.id}`)}
    />
  );

  const noEvents = !loadingEvents && upcoming.length === 0 && past.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.text}
            colors={[c.text]}
            progressViewOffset={topSpacing}
          />
        }
      >
        {/* Identity */}
        <View style={styles.hero}>
          {loading ? (
            <>
              <Skeleton width={AVATAR + 10} height={AVATAR + 10} borderRadius={(AVATAR + 10) / 2} />
              <Skeleton width={180} height={22} borderRadius={6} style={{ marginTop: spacing[5] }} />
              <Skeleton width={130} height={14} borderRadius={6} style={{ marginTop: spacing[3] }} />
            </>
          ) : (
            <>
              <View style={[styles.ring, { borderColor: c.outline }]}>
                <View style={[styles.avatar, { backgroundColor: c.card }]}>
                  {profile?.avatarUrl ? (
                    <Image source={{ uri: profile.avatarUrl }} style={StyleSheet.absoluteFill} />
                  ) : (
                    <Text style={[styles.initials, { color: c.text }]}>{initials(name)}</Text>
                  )}
                </View>
              </View>
              <Text style={[styles.name, { color: c.text }]}>{name}</Text>
              <Text style={[styles.sub, { color: c.muted }]}>
                {[profile?.username ? `@${profile.username}` : null, joined].filter(Boolean).join('  ·  ')}
              </Text>
              {profile?.bio ? <Text style={[styles.bio, { color: c.soft }]}>{profile.bio}</Text> : null}

              {links.length > 0 ? (
                <View style={styles.links}>
                  {links.map((l) => (
                    <Pressable
                      key={l.key}
                      onPress={() => Linking.openURL(toUrl(String(profile![l.key]))).catch(() => {})}
                      accessibilityRole="link"
                      accessibilityLabel={`Open ${l.label}`}
                      style={({ pressed }) => [styles.link, { backgroundColor: c.raised, transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                    >
                      <UnGlyph name={l.icon} size={16} color={c.text} />
                      <Text style={[styles.linkText, { color: c.text }]}>{l.label}</Text>
                      <ArrowUpRight size={12} color={c.muted} weight="bold" />
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </View>

        {/* Numbers: bare, divided by hairlines */}
        <View style={[styles.stats, { borderColor: c.border }]}>
          {stats.map((s) => (
            <View key={s.label} style={styles.stat}>
              {s.loading ? (
                <Skeleton width={28} height={24} borderRadius={6} />
              ) : (
                <Text style={[styles.statValue, { color: c.text }]}>{s.value}</Text>
              )}
              <Text style={[styles.statLabel, { color: c.muted }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.pad}>
          <AuthButton label="Edit profile" variant="secondary" onPress={() => router.push('/edit-profile')} />
        </View>

        {loadingEvents ? (
          <Section title="Going to">
            <Rail>{[0, 1].map((i) => <PosterCardSkeleton key={i} />)}</Rail>
          </Section>
        ) : noEvents ? (
          <View style={[styles.prompt, { backgroundColor: c.raised }]}>
            <View style={[styles.rule, { backgroundColor: `rgba(${c.glow}, 0.7)` }]} />
            <Text style={[styles.promptTitle, { color: c.text }]}>No events yet</Text>
            <Text style={[styles.promptBody, { color: c.soft }]}>
              Events you register for show up here, so people can see where you’ll be.
            </Text>
            <AuthButton label="Browse events" arrow onPress={() => router.push('/events')} style={{ marginTop: spacing[6] }} />
          </View>
        ) : (
          <>
            {upcoming.length > 0 ? (
              <Section title="Going to" subtitle={`${upcoming.length} coming up`}>
                <Rail>{upcoming.slice(0, 10).map(poster)}</Rail>
              </Section>
            ) : null}
            {past.length > 0 ? (
              <Section title="Been to" subtitle={`${past.length} ${past.length === 1 ? 'event' : 'events'} so far`}>
                <Rail>{past.slice(0, 10).map(poster)}</Rail>
              </Section>
            ) : null}
          </>
        )}

        {loadingCircles || circles.length > 0 ? (
          <Section title="Circles" onSeeAll={circles.length ? () => router.push({ pathname: '/spaces', params: { mine: 'true' } }) : undefined}>
            <CircleRow
              spaces={circles}
              loading={loadingCircles}
              onPress={(s) => router.push(`/space/${s.id}`)}
              onFindMore={() => router.push('/spaces')}
            />
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { paddingHorizontal: GUTTER },
  hero: { alignItems: 'center', paddingHorizontal: GUTTER, paddingTop: spacing[6] },
  ring: {
    width: AVATAR + 10,
    height: AVATAR + 10,
    borderRadius: (AVATAR + 10) / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontSize: 30, ...cosmosFont.display },
  // Michroma runs wide: 22 reads like a 26 in Hanken.
  name: { marginTop: spacing[5], fontSize: 22, lineHeight: 30, textAlign: 'center', ...cosmosFont.display },
  sub: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.body },
  bio: {
    marginTop: spacing[4],
    maxWidth: 340,
    fontSize: typography.fontSize.base,
    lineHeight: 22,
    textAlign: 'center',
    ...cosmosFont.body,
  },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing[2], marginTop: spacing[5] },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: spacing[3],
    borderRadius: 999,
  },
  linkText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  stats: {
    flexDirection: 'row',
    marginHorizontal: GUTTER,
    marginTop: spacing[8],
    marginBottom: spacing[6],
    paddingVertical: spacing[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { fontSize: 20, lineHeight: 26, ...cosmosFont.figure },
  statLabel: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  prompt: { marginHorizontal: GUTTER, marginTop: spacing[12], borderRadius: cosmosCardRadius, padding: spacing[6] },
  rule: { width: 40, height: 1, marginBottom: spacing[5] },
  promptTitle: { fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  promptBody: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
});
