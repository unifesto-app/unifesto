import React, { useCallback, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useFocusEffect, useRouter } from 'expo-router';
import { UnGlyph } from '@unifesto/unicon/react-native';
import { useAuth } from '../context/AuthContext';
import * as AuthAPI from '../lib/api/auth';
import { getMyRegisteredEvents, type Event } from '../lib/api/events';
import { getUserSpaces, type Space } from '../lib/api/spaces';
import { isEventOver } from '../lib/upcomingTickets';
import { coverOr, useDefaultImages } from '../lib/defaultImages';
import useTopSpacing from '../hooks/useTopSpacing';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import { Rail, Section, GUTTER } from '../components/home/Section';
import PosterCard, { PosterCardSkeleton } from '../components/home/PosterCard';
import { MySpacesRows } from '../components/home/SpaceCards';
import IdentityHeader, { IdentityHeaderSkeleton } from '../components/profile/IdentityHeader';
import BrandIcon from '../components/profile/BrandIcon';
import { relativeWhen } from '../utils/eventFormat';
import { column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';
import { AppAlert } from '../components/ui/AppAlert';

const MARK = 26;

/** My links as their real marks; GitHub's mark is monochrome, so the glyph in text colour is the real one. */
const LINKS: { key: keyof AuthAPI.User; label: string; mark: (color: string) => React.ReactNode }[] = [
  { key: 'linkedinUrl', label: 'LinkedIn', mark: () => <BrandIcon brand="linkedin" size={MARK} /> },
  { key: 'instagramUrl', label: 'Instagram', mark: () => <BrandIcon brand="instagram" size={MARK} /> },
  { key: 'githubUrl', label: 'GitHub', mark: (color) => <UnGlyph name="github-logo" size={MARK} color={color} weight="fill" /> },
  { key: 'websiteUrl', label: 'Website', mark: (color) => <UnGlyph name="globe" size={MARK} color={color} /> },
];

/** People type "github.com/me" as often as the full URL. */
const toUrl = (raw: string) => (/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);

/**
 * "View profile": the signed-in user's own profile as others would see it.
 * The centred identity (IdentityHeader, numbers in a hairline band; the
 * Profile tab shows a compact row instead) with my links as bare brand marks, then what I'm going to,
 * where I've been and the spaces I'm in.
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
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingSpaces, setLoadingSpaces] = useState(true);
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
    const spacesTask = getUserSpaces()
      .then((s) => setSpaces((s || []).filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i)))
      .catch(() => {})
      .finally(() => setLoadingSpaces(false));

    await Promise.all([profileTask, eventsTask, spacesTask]);
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
  const links = profile ? LINKS.filter((l) => !!profile[l.key]) : [];
  const counting = loadingEvents || loadingSpaces;


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
        contentContainerStyle={[column, { paddingTop: topSpacing, paddingBottom: 100 }]}
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
        <View style={styles.identity}>
          {loading || !profile ? (
            <IdentityHeaderSkeleton />
          ) : (
            <IdentityHeader
              name={name}
              username={profile.username}
              avatarUrl={profile.avatarUrl}
              bio={profile.bio}
              memberSince={profile.createdAt}
              onEdit={() => router.push('/edit-profile')}
              links={
                links.length > 0 ? (
                  <View style={styles.links}>
                    {links.map((l) => (
                      <Pressable
                        key={l.key}
                        onPress={() => Linking.openURL(toUrl(String(profile[l.key]))).catch(() => {})}
                        accessibilityRole="link"
                        accessibilityLabel={`Open ${l.label}`}
                        hitSlop={10}
                        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
                      >
                        {l.mark(c.text)}
                      </Pressable>
                    ))}
                  </View>
                ) : null
              }
              stats={[
                { label: 'Going to', value: counting ? null : upcoming.length, accent: c.sky },
                { label: 'Been to', value: counting ? null : past.length, accent: c.mint },
                { label: 'Spaces', value: counting ? null : spaces.length },
              ]}
            />
          )}
        </View>

        {loadingEvents ? (
          <Section title="Going to">
            <Rail>{[0, 1].map((i) => <PosterCardSkeleton key={i} />)}</Rail>
          </Section>
        ) : noEvents ? (
          // An empty state straight on the page: one headline, one line, one button.
          <View style={styles.prompt}>
            <Text style={[styles.promptTitle, { color: c.text }]} accessibilityRole="header">No events yet</Text>
            <Text style={[styles.promptBody, { color: c.muted }]}>
              Events I register for show up here, so people can see where I’ll be.
            </Text>
            <AuthButton label="Browse events" arrow onPress={() => router.push('/events')} style={styles.promptButton} />
          </View>
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

        {loadingSpaces || spaces.length > 0 ? (
          <Section title="Spaces" onSeeAll={spaces.length ? () => router.push({ pathname: '/spaces', params: { mine: 'true' } }) : undefined}>
            <MySpacesRows
              spaces={spaces}
              loading={loadingSpaces}
              onPress={(s) => router.push(`/space/${s.id}`)}
            />
          </Section>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  identity: { paddingHorizontal: GUTTER, paddingTop: spacing[6] },
  // Bare marks, as in the Profile footer: no chips, no tiles.
  links: { flexDirection: 'row', justifyContent: 'center', gap: spacing[8], marginTop: spacing[5] },
  prompt: { alignItems: 'center', paddingHorizontal: GUTTER, marginTop: spacing[12] },
  promptTitle: { fontSize: 24, lineHeight: 30, textAlign: 'center', ...cosmosFont.display, letterSpacing: displayTracking(24) },
  promptBody: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: 22, textAlign: 'center', ...cosmosFont.body },
  promptButton: { marginTop: spacing[6], alignSelf: 'stretch' },
});
