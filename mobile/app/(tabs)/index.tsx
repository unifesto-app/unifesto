import React from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { RefreshControl } from '../../src/components/ui/RefreshControl';
import { useRouter } from 'expo-router';
import { Buildings, IdentificationCard, ShieldCheck, Sparkle, UserCircle, UsersThree } from '@unifesto/unicon/react-native';
import { useStableTopInset } from '../../src/components/CustomHeader';
import CosmosBackdrop from '../../src/components/ui/CosmosBackdrop';
import { useCosmos } from '../../src/theme/cosmos';
import { composeHome, useHomeData } from '../../src/hooks/useHomeData';
import { useHomeSearch } from '../../src/hooks/useHomeSearch';
import type { Event } from '../../src/lib/api/events';
import HomeHeader from '../../src/components/home/HomeHeader';
import { GUTTER, Section } from '../../src/components/home/Section';
import DayRows, { ActionRow, EventRow, EventRowSkeleton } from '../../src/components/home/EventRows';
import UpNextCard, { UpNextCardSkeleton } from '../../src/components/home/UpNextCard';
import HackathonCard, { useMyHackathon } from '../../src/components/home/HackathonCard';
import InviteCards from '../../src/components/home/InviteCards';
import { useMyInvites } from '../../src/hooks/useMyInvites';
import { useUnreadNotifications } from '../../src/hooks/useUnreadNotifications';
import PromptCard from '../../src/components/home/PromptCard';
import { LinkRow, LiveCheckinCard, Rows } from '../../src/components/home/SpacePanel';
import { useWorkspaceCards } from '../../src/hooks/useWorkspaceCards';
import VibeRail, { VibeRailSkeleton } from '../../src/components/home/VibeRail';
import HostCta from '../../src/components/home/HostCta';
import SearchSheet from '../../src/components/home/SearchSheet';
import type { Preset } from '../../src/hooks/useEventsBrowse';
import { relativeWhen } from '../../src/utils/eventFormat';
import { column, spacing } from '../../src/theme/spacing';
import { successTap } from '../../src/lib/haptics';

export default function HomeTab() {
  const router = useRouter();
  const c = useCosmos();
  const topInset = useStableTopInset();
  const data = useHomeData();
  // Group-seat invites waiting for me (refetched on focus).
  const myInvites = useMyInvites();
  const unread = useUnreadNotifications();
  const search = useHomeSearch();
  // Live check-ins and the Space / Apex rows, shown only to people who have those tabs.
  const workspace = useWorkspaceCards();
  const { user, profile } = data;

  // ── Navigation ──────────────────────────────────────────────────────────
  const openEvent = (e: Pick<Event, 'id' | 'slug'>) => router.push(`/event/${e.slug || e.id}`);
  const openSpace = (s: { id: string }) => router.push(`/space/${s.id}`);
  const openCategory = (name: string) => router.push({ pathname: '/events', params: { category: name } });
  const openPreset = (preset: Preset) => router.push({ pathname: '/events', params: { preset } });
  const openSpaces = () => router.push('/spaces');

  // ── What each list shows: every event once (see composeHome) ───────────
  // Nothing coming up in my spaces (or none joined): the space Apex features instead.
  const { fromMySpaces, featured, shortlist, nearYou } = composeHome({
    tickets: data.upcomingTickets,
    invitedEventIds: myInvites.invites.map((i) => i.event.id),
    spaceEvents: data.spaceEvents,
    featuredEvents: data.featuredSpace ? data.featuredEvents : [],
    favorites: data.favoriteEvents,
    feed: data.feedEvents,
  });
  const feedLoading = data.isLoadingFeed || myInvites.loading;
  // The space list shows once what it skips has loaded (not the location fix),
  // then stays put through refreshes. Per person: signing in waits again.
  const userKey = user?.id ?? 'out';
  const spacesSettledFor = React.useRef<string | null>(null);
  if (!data.isLoadingSpaceLists && !myInvites.loading) spacesSettledFor.current = userKey;
  const spacesSettled = spacesSettledFor.current === userKey;

  // At most one nudge, in priority order: sign in → username → full name.
  const prompt = !user
    ? { icon: <Sparkle size={20} color={c.text} weight="fill" />, title: 'Sign in to get tickets', body: 'Save events and keep every pass here.', to: '/login' as const }
    : profile && !profile.username
      ? { icon: <IdentificationCard size={20} color={c.text} weight="fill" />, title: 'Pick a username', body: 'So friends and organisers can find you.', to: '/account' as const }
      : profile && !profile.fullName
        ? { icon: <UserCircle size={20} color={c.text} weight="fill" />, title: 'Finish your profile', body: 'Add your name before you register.', to: '/edit-profile' as const }
        : null;

  // The Space and Apex tabs, one row each: the tabs hold the detail.
  const nextHosted = workspace.upcoming[0];
  const spaceMeta = nextHosted
    ? `Next: ${nextHosted.title} · ${relativeWhen(nextHosted.startDateTime)}`
    : workspace.judging.length > 0
      ? `${workspace.judging.length} to judge`
      : 'Events, check-in and my team';
  const waiting = workspace.needs.reduce((sum, n) => sum + n.count, 0);
  const apexMeta = waiting > 0 ? `${waiting.toLocaleString('en-IN')} waiting on me` : workspace.loadingApex ? 'Requests, money and support' : 'All clear';

  // A success tap when a pull-to-refresh I started lands (not on background reloads).
  const pulled = React.useRef(false);
  React.useEffect(() => {
    if (!data.refreshing && pulled.current) {
      pulled.current = false;
      successTap();
    }
  }, [data.refreshing]);

  const nextTicket = data.upcomingTickets[0];
  // My team hub, when one of my upcoming tickets is a hackathon I'm on a team in.
  const hackathon = useMyHackathon(data.upcomingTickets);
  const city = data.detectedCity;

  // A plain View wraps the ScrollView so it is NOT the screen's root
  // scrollable: that stops the native tab host from auto-adding the safe-area
  // top inset on top of the header's own spacing (see mobile-tab-top-spacing).
  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentContainerStyle={[column, styles.content]}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={data.refreshing}
            onRefresh={() => {
              pulled.current = true;
              void myInvites.refresh();
              workspace.refresh();
              data.onRefresh();
            }}
            tintColor={c.text}
            colors={[c.text]}
            progressViewOffset={topInset}
          />
        }
      >
        <HomeHeader
          signedIn={!!user}
          city={city}
          locationStatus={data.locationStatus}
          onEnableLocation={() => (data.canAskLocation ? void data.loadLocation() : void Linking.openSettings())}
          unread={unread}
          onPressBell={() => router.push('/notifications')}
          onPressPreset={openPreset}
          onPressSearch={search.openSheet}
        />

        {myInvites.invites.length > 0 ? (
          <View style={styles.block}>
            <InviteCards invites={myInvites.invites} onOpen={(t) => router.push(`/claim/${t}`)} onDecline={myInvites.decline} />
          </View>
        ) : null}

        {prompt ? (
          <View style={styles.block}>
            <PromptCard icon={prompt.icon} title={prompt.title} body={prompt.body} onPress={() => router.push(prompt.to)} />
          </View>
        ) : null}

        {/* Skeleton only until the first answer: on pull-to-refresh the stale
            card stays put rather than flashing back to a placeholder. */}
        {!nextTicket && data.isLoadingTickets ? (
          <View style={styles.block}>
            <UpNextCardSkeleton />
          </View>
        ) : nextTicket ? (
          <View style={styles.block}>
            <UpNextCard
              ticket={nextTicket}
              moreCount={data.upcomingTickets.length - 1}
              onOpenTicket={() =>
                router.push({ pathname: '/ticket/[id]', params: { id: nextTicket.id, ticket: JSON.stringify(nextTicket) } })
              }
              onSeeAllTickets={() => router.navigate('/tickets')}
            />
          </View>
        ) : null}

        {hackathon ? (
          <View style={styles.block}>
            <HackathonCard hub={hackathon} onPress={() => router.push(`/hackathon/${hackathon.eventId}` as never)} />
          </View>
        ) : null}

        {/* A check-in running now is the one operator thing that can't wait for the Space tab. */}
        {workspace.liveCheckins.length > 0 ? (
          <View style={[styles.block, styles.cards]}>
            {workspace.liveCheckins.map((e) => (
              <LiveCheckinCard
                key={e.id}
                event={e}
                onScan={() =>
                  router.push({
                    pathname: `/checkin/${e.id}`,
                    params: { title: e.title, startDateTime: e.startDateTime, venueName: e.venueName || e.city || '' },
                  })
                }
              />
            ))}
          </View>
        ) : null}

        {/* Mine first, then discovery: what the spaces I joined have coming up, else
            the featured space, each closed by a way to find more spaces. */}
        {spacesSettled && fromMySpaces.length > 0 ? (
          <Section title="From my spaces" onSeeAll={() => router.push({ pathname: '/spaces', params: { mine: 'true' } })}>
            <View style={styles.rows}>
              <Rows>
                {fromMySpaces.map((e) => (
                  <EventRow key={e.id} event={e} when={relativeWhen(e.startDateTime)} onPress={() => openEvent(e)} />
                ))}
              </Rows>
              <ActionRow label="Explore spaces" onPress={openSpaces} />
            </View>
          </Section>
        ) : spacesSettled && data.featuredSpace && featured.length > 0 ? (
          <Section title={data.featuredSpace.name} onSeeAll={() => openSpace(data.featuredSpace!)}>
            <View style={styles.rows}>
              <Rows>
                {featured.map((e) => (
                  <EventRow key={e.id} event={e} hideHost when={relativeWhen(e.startDateTime)} onPress={() => openEvent(e)} />
                ))}
              </Rows>
              <ActionRow label="Explore spaces" onPress={openSpaces} />
            </View>
          </Section>
        ) : null}

        <Section title={city ? 'Happening near you' : 'Happening soon'}>
          <DayRows
            // A new person (signing in or out) gets a fresh first load.
            key={userKey}
            events={nearYou}
            loading={feedLoading}
            failed={data.eventsFailed}
            onRetry={data.onRefresh}
            onPressEvent={openEvent}
            allLabel={city ? `All events in ${city}` : 'All events'}
            // K1: "near you" opens that city's events.
            onSeeAll={() => router.push(city ? { pathname: '/events', params: { city } } : '/events')}
            // Everything coming up is already in the lists above.
            emptyTitle={data.feedEvents.length > 0 ? 'Nothing else coming up' : undefined}
            footer={
              city && profile ? (
                <ActionRow
                  label={data.cityAlertOn ? `Alerts on for new events in ${city}` : `Tell me about new events in ${city}`}
                  checked={data.cityAlertOn}
                  hint={data.cityAlertOn ? 'Turns these alerts off' : 'Sends a notification when an event in this city is published'}
                  onPress={() => void data.toggleCityAlert()}
                />
              ) : null
            }
          />
        </Section>

        {/* Neither space list showed: keep a way into spaces on the page. */}
        {spacesSettled && fromMySpaces.length === 0 && featured.length === 0 ? (
          <View style={[styles.rows, styles.lone]}>
            <Rows>
              <LinkRow key="spaces" icon={<UsersThree size={24} color={c.text} />} title="Explore spaces" meta="Clubs, colleges and communities" onPress={openSpaces} />
            </Rows>
          </View>
        ) : null}

        {data.isLoadingCategories || data.categories.length > 0 ? (
          <Section title="Find your vibe">
            {data.categories.length === 0 ? (
              <VibeRailSkeleton />
            ) : (
              <VibeRail categories={data.categories} onPressCategory={openCategory} />
            )}
          </Section>
        ) : null}

        {user && ((data.isLoadingFavorites && data.favoriteEvents.length === 0) || shortlist.length > 0) ? (
          <Section title="My shortlist" onSeeAll={() => router.push('/favorites')}>
            <View style={styles.rows}>
              <Rows>
                {shortlist.length === 0
                  ? [0, 1].map((i) => <EventRowSkeleton key={i} />)
                  : shortlist.map((e) => (
                      <EventRow key={e.id} event={e} when={relativeWhen(e.startDateTime)} onPress={() => openEvent(e)} />
                    ))}
              </Rows>
            </View>
          </Section>
        ) : null}

        {!workspace.showSpace ? (
          <View style={{ marginTop: spacing[12] }}>
            <HostCta onPress={() => router.push(user ? '/space-request' : '/login')} />
          </View>
        ) : null}

        {/* The other side of the door: the Space and Apex tabs hold the tools, Home just points there. */}
        {workspace.showSpace || workspace.showApex ? (
          <Section title="Manage">
            <View style={styles.rows}>
              <Rows>
                {workspace.showSpace ? (
                  <LinkRow key="space" icon={<Buildings size={24} color={c.text} />} title="My space" meta={spaceMeta} onPress={() => router.navigate('/space')} />
                ) : null}
                {workspace.showApex ? (
                  <LinkRow key="apex" icon={<ShieldCheck size={24} color={c.text} />} title="Apex" meta={apexMeta} onPress={() => router.navigate('/apex')} />
                ) : null}
              </Rows>
            </View>
          </Section>
        ) : null}
      </ScrollView>

      <SearchSheet
        search={search}
        categories={data.categories}
        trending={data.trendingEvents.length > 0 ? data.trendingEvents : data.popularEvents}
        popularSpaces={data.allSpaces}
        onOpenEvent={openEvent}
        onOpenSpace={openSpace}
        onOpenCategory={openCategory}
        onSubmit={(term) => {
          const t = term.trim();
          if (!t) return;
          search.saveRecentSearch(t);
          search.closeSheet();
          router.push({ pathname: '/events', params: { search: t } });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  // Clears the floating native tab bar.
  content: { paddingBottom: 120 },
  block: { marginTop: spacing[8] },
  cards: { paddingHorizontal: GUTTER, gap: spacing[3] },
  rows: { paddingHorizontal: GUTTER },
  lone: { marginTop: spacing[8] },
});
