import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useRouter } from 'expo-router';
import { UnGlyph, type GlyphName } from '@unifesto/unicon/react-native';
import { useAuth } from '../context/AuthContext';
import { useTokens } from '../context/ThemeContext';
import * as AuthAPI from '../lib/api/auth';
import { getMyRegisteredEvents, type Event } from '../lib/api/events';
import { getUserSpaces } from '../lib/api/spaces';
import useTopSpacing from '../hooks/useTopSpacing';
import Skeleton from '../components/Skeleton';
import ProfileHero, { ProfileHeroSkeleton } from '../components/profile/ProfileHero';
import { Rail, Section, GUTTER } from '../components/home/Section';
import PosterCard, { PosterCardSkeleton } from '../components/home/PosterCard';
import { relativeWhen } from '../utils/eventFormat';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { AppAlert } from '../components/ui/AppAlert';

type IconName = GlyphName;

const LINKS: { key: keyof AuthAPI.User; icon: IconName; label: string }[] = [
  { key: 'linkedinUrl', icon: 'linkedin-logo', label: 'LinkedIn' },
  { key: 'instagramUrl', icon: 'instagram-logo', label: 'Instagram' },
  { key: 'githubUrl', icon: 'github-logo', label: 'GitHub' },
  { key: 'websiteUrl', icon: 'globe', label: 'Website' },
];

/** People type "github.com/me" as often as the full URL. */
const toUrl = (raw: string) => (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);

/**
 * "View profile": the signed-in user's own profile as others would see it —
 * identity, a few numbers, their links, and the events they're going to / went to.
 */
export default function UserProfileScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const { user, token } = useAuth();

  const [profile, setProfile] = useState<AuthAPI.User | null>(null);
  const [upcoming, setUpcoming] = useState<Event[]>([]);
  const [past, setPast] = useState<Event[]>([]);
  const [circleCount, setCircleCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user || !token) {
      router.back();
      return;
    }
    const profileTask = AuthAPI.getCurrentUser(token)
      .then(setProfile)
      .catch(() => AppAlert.alert('Error', 'Failed to load profile'))
      .finally(() => setLoading(false));

    const eventsTask = getMyRegisteredEvents(1, 50)
      .then((resp) => {
        const regs = resp?.data || resp?.events || [];
        const all: Event[] = regs.map((r: any) => (r.event ? r.event : r)).filter((e: any) => e?.id);
        // One card per event even if registered twice (e.g. a group + own ticket).
        const unique = all.filter((e, i) => all.findIndex((x) => x.id === e.id) === i);
        const now = Date.now();
        const at = (e: Event) => new Date(e.startDateTime).getTime();
        setUpcoming(unique.filter((e) => at(e) >= now).sort((a, b) => at(a) - at(b)));
        setPast(unique.filter((e) => at(e) < now).sort((a, b) => at(b) - at(a)));
      })
      .catch(() => {})
      .finally(() => setLoadingEvents(false));

    const circlesTask = getUserSpaces(token)
      .then((s) => setCircleCount(s?.length ?? 0))
      .catch(() => {});

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

  const links = profile ? LINKS.filter((l) => !!profile[l.key]) : [];

  const stats = [
    { label: 'Upcoming', value: upcoming.length },
    { label: 'Past', value: past.length },
    { label: 'Circles', value: circleCount },
  ];

  const poster = (e: Event) => (
    <PosterCard
      key={e.id}
      title={e.title}
      imageUrl={e.coverImageUrl}
      when={relativeWhen(e.startDateTime)}
      where={e.venueName || e.city || e.space?.name}
      onPress={() => router.push(`/event/${e.slug || e.id}`)}
    />
  );

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={{ paddingTop: topSpacing, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    >
      <View style={{ paddingHorizontal: GUTTER }}>
        {loading ? (
          <ProfileHeroSkeleton />
        ) : (
          <ProfileHero
            name={profile?.fullName || profile?.username || 'My profile'}
            username={profile?.username}
            avatarUrl={profile?.avatarUrl}
            bio={profile?.bio}
            memberSince={profile?.createdAt}
            onEdit={() => router.push('/edit-profile')}
          />
        )}

        {/* Numbers: bare, no tiles */}
        <View style={styles.stats}>
          {stats.map((s) => (
            <View key={s.label} style={styles.stat}>
              {loadingEvents ? (
                <Skeleton width={32} height={26} borderRadius={6} />
              ) : (
                <Text style={[styles.statValue, { color: tokens.text }]}>{s.value}</Text>
              )}
              <Text style={[styles.statLabel, { color: tokens.textMuted }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {links.length > 0 ? (
          <View style={styles.links}>
            {links.map((l) => (
              <Pressable
                key={l.key}
                onPress={() => Linking.openURL(toUrl(String(profile![l.key]))).catch(() => {})}
                hitSlop={8}
                accessibilityRole="link"
                accessibilityLabel={l.label}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
              >
                <UnGlyph name={l.icon} size={30} color={tokens.text} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {loadingEvents ? (
        <Section title="Going to">
          <Rail>{[0, 1].map((i) => <PosterCardSkeleton key={i} />)}</Rail>
        </Section>
      ) : (
        <>
          {upcoming.length > 0 ? (
            <Section title="Going to">
              <Rail>{upcoming.slice(0, 10).map(poster)}</Rail>
            </Section>
          ) : null}
          {past.length > 0 ? (
            <Section title="Been to">
              <Rail>{past.slice(0, 10).map(poster)}</Rail>
            </Section>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', justifyContent: 'center', gap: spacing[10], marginTop: spacing[8] },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: typography.fontSize['2xl'], ...font('heading') },
  statLabel: { fontSize: typography.fontSize.sm, ...font() },
  links: { flexDirection: 'row', justifyContent: 'center', gap: spacing[6], marginTop: spacing[6] },
});
