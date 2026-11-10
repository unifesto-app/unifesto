import React from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { RefreshControl } from '../../src/components/ui/RefreshControl';
import { useRouter } from 'expo-router';
import { CalendarDots, Globe, IdentificationCard, Sparkle, Ticket, UserCircle, UsersThree } from '@unifesto/unicon/react-native';
import { useStableTopInset } from '../../src/components/CustomHeader';
import CosmosBackdrop from '../../src/components/ui/CosmosBackdrop';
import { useCosmos } from '../../src/theme/cosmos';
import { useHomeData } from '../../src/hooks/useHomeData';
import { useHomeSearch } from '../../src/hooks/useHomeSearch';
import type { Event } from '../../src/lib/api/events';
import HomeHeader from '../../src/components/home/HomeHeader';
import { GUTTER, Section } from '../../src/components/home/Section';
import DayRows, { EventRow, EventRowSkeleton } from '../../src/components/home/EventRows';
import UpNextCard, { UpNextCardSkeleton } from '../../src/components/home/UpNextCard';
import HackathonCard, { useMyHackathon } from '../../src/components/home/HackathonCard';
import InviteCards from '../../src/components/home/InviteCards';
import { useMyInvites } from '../../src/hooks/useMyInvites';
import { useUnreadNotifications } from '../../src/hooks/useUnreadNotifications';
import PromptCard from '../../src/components/home/PromptCard';
import SpacePanel, { LinkRow, Rows } from '../../src/components/home/SpacePanel';
import ApexPanel from '../../src/components/home/ApexPanel';
import { useWorkspaceCards } from '../../src/hooks/useWorkspaceCards';
import { MySpacesRows } from '../../src/components/home/SpaceCards';
import HostCta from '../../src/components/home/HostCta';
import SearchSheet from '../../src/components/home/SearchSheet';
import type { Preset } from '../../src/hooks/useEventsBrowse';
import { relativeWhen, weekendLabel } from '../../src/utils/eventFormat';
import { isEventOver } from '../../src/lib/eventEnded';
import { column, spacing } from '../../src/theme/spacing';
import { successTap } from '../../src/lib/haptics';
import { openSpaceWeb } from '../../src/lib/openOnWeb';

export default function HomeTab() {
  const router = useRouter();
  const c = useCosmos();
  const topInset = useStableTopInset();
  const data = useHomeData();
  // Group-seat invites waiting for me (refetched on focus).
  const myInvites = useMyInvites();
  const unread = useUnreadNotifications();
  const search = useHomeSearch();
  // Shortcuts into the Space / Apex tabs, shown only to people who have them.
  const workspace = useWorkspaceCards();
  const { user, profile } = data;

  // ── Navigation ──────────────────────────────────────────────────────────
  const openEvent = (e: Pick<Event, 'id' | 'slug'>) => router.push(`/event/${e.slug || e.id}`);
  const openSpace = (s: { id: string }) => router.push(`/space/${s.id}`);
  const openCategory = (name: string) => router.push({ pathname: '/events', params: { category: name } });
  const openPreset = (preset: Preset) => router.push({ pathname: '/events', params: { preset } });
  // Browse glyphs carry the events accent; Explore spaces isn't events, so it stays text.
  const browseGlyph = { size: 24, color: c.sky };
  // /favorites is newest-saved first and keeps ended events: show the next three coming up.
  const shortlist = data.favoriteEvents
    .filter((e) => !isEventOver(e))
    .sort((a, b) => new Date(a.startDateTime).getTime() - new Date(b.startDateTime).getTime())
    .slice(0, 3);

  // At most one nudge, in priority order: sign in → username → full name.
  const prompt = !user
    ? { icon: <Sparkle size={20} color={c.text} weight="fill" />, title: 'Sign in to get tickets', body: 'Save events and keep every pass here.', to: '/login' as const }
    : profile && !profile.username
      ? { icon: <IdentificationCard size={20} color={c.text} weight="fill" />, title: 'Pick a username', body: 'So friends and organisers can find you.', to: '/account' as const }
      : profile && !profile.fullName
        ? { icon: <UserCircle size={20} color={c.text} weight="fill" />, title: 'Finish your profile', body: 'Add your name before you register.', to: '/edit-profile' as const }
        : null;

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
          city={data.detectedCity}
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

        {/* Discovery first, then mine: a list of what's next, ways in, and my own things. */}
        <Section title={data.detectedCity ? 'Happening near you' : 'Happening soon'}>
          <DayRows
            events={data.feedEvents}
            loading={data.isLoadingFeed}
            failed={data.eventsFailed}
            onRetry={data.onRefresh}
            onPressEvent={openEvent}
            allLabel={data.detectedCity ? `All events in ${data.detectedCity}` : 'All events'}
            // K1: "near you" opens that city's events.
            onSeeAll={() => router.push(data.detectedCity ? { pathname: '/events', params: { city: data.detectedCity } } : '/events')}
          />
        </Section>

        <Section title="Browse">
          <View style={styles.rows}>
            <Rows>
              <LinkRow key="weekend" icon={<CalendarDots {...browseGlyph} />} title="This weekend" meta={weekendLabel()} onPress={() => openPreset('weekend')} />
              <LinkRow key="free" icon={<Ticket {...browseGlyph} />} title="Free to attend" meta="Events with free tickets" onPress={() => openPreset('free')} />
              <LinkRow key="online" icon={<Globe {...browseGlyph} />} title="Online from anywhere" meta="Join from home" onPress={() => openPreset('online')} />
              <LinkRow key="spaces" icon={<UsersThree size={24} color={c.text} />} title="Explore spaces" meta="Clubs, colleges and communities" onPress={() => router.push('/spaces')} />
            </Rows>
          </View>
        </Section>

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

        {user && (data.isLoadingMySpaces || data.mySpaces.length > 0) ? (
          <Section title="My spaces" onSeeAll={() => router.push({ pathname: '/spaces', params: { mine: 'true' } })}>
            <MySpacesRows
              spaces={data.mySpaces}
              loading={data.isLoadingMySpaces}
              onPress={openSpace}
            />
          </Section>
        ) : null}

        {!workspace.showSpace ? (
          <View style={{ marginTop: spacing[12] }}>
            <HostCta onPress={() => router.push(user ? '/space-request' : '/login')} />
          </View>
        ) : null}

        {/* The other side of the door: tools for people running events. They also
            have their own tabs, so they follow discovery instead of leading it. */}
        {workspace.showSpace ? (
          <Section title="My space" onSeeAll={() => router.navigate('/space')}>
            <SpacePanel
              liveCheckins={workspace.liveCheckins}
              upcoming={workspace.upcoming}
              loadingUpcoming={workspace.loadingUpcoming}
              hosting={workspace.hostedSpaceIds.length > 0}
              canCreate={workspace.adminSpaceIds.length > 0}
              judging={workspace.judging}
              sponsorships={workspace.sponsorships}
              onScan={(e) =>
                router.push({
                  pathname: `/checkin/${e.id}`,
                  params: { title: e.title, startDateTime: e.startDateTime, venueName: e.venueName || e.city || '' },
                })
              }
              onOpenEvent={(e) => router.push(`/manage/event/${e.id}`)}
              onCreateEvent={() =>
                // One space I can create in: straight into the web form (G1 moved editing to the
                // web). Otherwise pick on the Space tab.
                workspace.adminSpaceIds.length === 1
                  ? openSpaceWeb('/events/new', workspace.adminSpaceIds[0])
                  : router.navigate('/space')
              }
              onOpenJudging={(j) => router.push({ pathname: `/judging/${j.eventId}`, params: { title: j.title } })}
              onOpenSponsor={(sp) => router.push(`/sponsoring/${sp.sponsorId}`)}
            />
          </Section>
        ) : null}

        {workspace.showApex ? (
          <Section title="Apex" onSeeAll={() => router.navigate('/apex')}>
            <ApexPanel
              overview={workspace.overview}
              needs={workspace.needs}
              loading={workspace.loadingApex}
              onOpenNeed={(n) => router.push(n.to)}
            />
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
  rows: { paddingHorizontal: GUTTER },
});
