import React from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { RefreshControl } from '../../src/components/ui/RefreshControl';
import { useRouter } from 'expo-router';
import { IdentificationCard, Sparkle, UserCircle } from '@unifesto/unicon/react-native';
import { useStableTopInset } from '../../src/components/CustomHeader';
import CosmosBackdrop from '../../src/components/ui/CosmosBackdrop';
import { useCosmos } from '../../src/theme/cosmos';
import { useHomeData } from '../../src/hooks/useHomeData';
import { useHomeSearch } from '../../src/hooks/useHomeSearch';
import type { Event } from '../../src/lib/api/events';
import { type Session } from '../../src/lib/api/sessions';
import HomeHeader from '../../src/components/home/HomeHeader';
import { Rail, Section } from '../../src/components/home/Section';
import HeroCarousel from '../../src/components/home/HeroCarousel';
import UpNextCard, { UpNextCardSkeleton } from '../../src/components/home/UpNextCard';
import HackathonCard, { useMyHackathon } from '../../src/components/home/HackathonCard';
import InviteCards from '../../src/components/home/InviteCards';
import { useMyInvites } from '../../src/hooks/useMyInvites';
import PromptCard from '../../src/components/home/PromptCard';
import SpacePanel from '../../src/components/home/SpacePanel';
import ApexPanel from '../../src/components/home/ApexPanel';
import { useWorkspaceCards } from '../../src/hooks/useWorkspaceCards';
import PosterCard, { PosterCardSkeleton } from '../../src/components/home/PosterCard';
import VibeRail, { VibeRailSkeleton } from '../../src/components/home/VibeRail';
import { CircleRow, SpaceCard, SpaceCardSkeleton } from '../../src/components/home/SpaceCards';
import TrendingList from '../../src/components/home/TrendingList';
import HostCta from '../../src/components/home/HostCta';
import BeyondFeature, { BeyondFeatureSkeleton } from '../../src/components/home/BeyondFeature';
import SearchSheet from '../../src/components/home/SearchSheet';
import { relativeWhen, shortPrice } from '../../src/utils/eventFormat';
import { spacing } from '../../src/theme/spacing';
import { successTap } from '../../src/lib/haptics';

export default function HomeTab() {
  const router = useRouter();
  const c = useCosmos();
  const topInset = useStableTopInset();
  const data = useHomeData();
  // Group-seat invites waiting for me (refetched on focus).
  const myInvites = useMyInvites();
  const search = useHomeSearch();
  // Shortcuts into the Space / Apex tabs, shown only to people who have them.
  const workspace = useWorkspaceCards();
  const { user, profile } = data;

  // '' when signed in without a name yet: icon avatar (never "T").
  const firstName = user
    ? (profile?.fullName || user.fullName || profile?.username || user.username || '').split(' ')[0]
    : null;

  // ── Navigation ──────────────────────────────────────────────────────────
  // Stable, so the memoised hero carousel doesn't re-render on every Home update.
  const openEvent = React.useCallback(
    (e: Pick<Event, 'id' | 'slug'>) => router.push(`/event/${e.slug || e.id}`),
    [router],
  );
  const openSession = (s: Session) => router.push(`/session/${s.slug}`);
  const openSpace = (s: { id: string }) => router.push(`/space/${s.id}`);
  const openCategory = (name: string) => router.push({ pathname: '/events', params: { category: name } });

  const eventPoster = (e: Event) => (
    <PosterCard
      key={e.id}
      title={e.title}
      imageUrl={e.coverImageUrl}
      when={relativeWhen(e.startDateTime)}
      where={e.venueName || e.city || (e.type === 'ONLINE' ? 'Online' : null)}
      host={e.space?.name}
      tag={e.categories?.[0] || e.category}
      price={shortPrice(e)}
      onPress={() => openEvent(e)}
    />
  );

  const sessionPoster = (s: Session) => {
    const price = Number(s.price);
    return (
      <PosterCard
        key={s.id}
        title={s.title}
        imageUrl={s.coverImageUrl}
        when={relativeWhen(s.startDateTime)}
        host={s.space?.name}
        where="Online"
        price={price > 0 ? `₹${price.toLocaleString('en-IN')}` : 'Free'}
        onPress={() => openSession(s)}
      />
    );
  };

  const posterSkeletons = [0, 1].map((i) => <PosterCardSkeleton key={i} />);

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
        contentContainerStyle={styles.content}
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
          firstName={firstName}
          avatarUrl={profile?.avatarUrl}
          city={data.detectedCity}
          locationStatus={data.locationStatus}
          onEnableLocation={() => (data.canAskLocation ? void data.loadLocation() : void Linking.openSettings())}
          onPressAvatar={() => router.navigate('/profile')}
          onPressPreset={(preset) => router.push({ pathname: '/events', params: { preset } })}
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

        {/* Mine first, then discovery. */}
        {user && (data.isLoadingFavorites || data.favoriteEvents.length > 0) ? (
          <Section title="My shortlist" onSeeAll={() => router.push('/favorites')}>
            <Rail>{data.isLoadingFavorites ? posterSkeletons : data.favoriteEvents.map(eventPoster)}</Rail>
          </Section>
        ) : null}

        {user && (data.isLoadingMySpaces || data.mySpaces.length > 0) ? (
          <Section title="My circles" onSeeAll={() => router.push({ pathname: '/spaces', params: { mine: 'true' } })}>
            <CircleRow
              spaces={data.mySpaces}
              loading={data.isLoadingMySpaces}
              onPress={openSpace}
              onFindMore={() => router.push('/spaces')}
            />
          </Section>
        ) : null}

        <Section title={data.detectedCity ? 'Happening near you' : 'Happening soon'} onSeeAll={() => router.push('/events')}>
          <HeroCarousel
            events={data.heroEvents}
            loading={data.isLoadingHero}
            failed={data.eventsFailed}
            onRetry={data.onRefresh}
            onPressEvent={openEvent}
          />
        </Section>

        {/* Under three it isn't much of a ranking. */}
        {data.trendingEvents.length >= 3 ? (
          <Section title="Trending now" subtitle="What people are booking this week">
            <TrendingList events={data.trendingEvents} onPress={openEvent} />
          </Section>
        ) : null}

        <Section title="Find your vibe">
          {data.isLoadingCategories && data.categories.length === 0 ? (
            <VibeRailSkeleton />
          ) : data.categories.length > 0 ? (
            <VibeRail categories={data.categories} onPressCategory={openCategory} />
          ) : null}
        </Section>

        {data.isLoadingSessions || data.sessions.length > 0 ? (
          <Section title="Unifesto Huddle" subtitle="Live online sessions and workshops" onSeeAll={() => router.push('/sessions')}>
            <Rail>{data.isLoadingSessions ? posterSkeletons : data.sessions.map(sessionPoster)}</Rail>
          </Section>
        ) : null}

        {data.isLoadingBeyond || data.beyondEvents.length > 0 ? (
          <Section title="Beyond by Unifesto" subtitle="Curated by the Unifesto team">
            {data.beyondSpace ? (
              <BeyondFeature space={data.beyondSpace} onPress={() => openSpace(data.beyondSpace!)} />
            ) : data.isLoadingBeyond ? (
              <BeyondFeatureSkeleton />
            ) : null}
            <View style={{ marginTop: spacing[4] }}>
              <Rail>{data.isLoadingBeyond ? posterSkeletons : data.beyondEvents.map(eventPoster)}</Rail>
            </View>
          </Section>
        ) : null}

        {data.isLoadingDiscoverSpaces || data.discoverSpaces.length > 0 ? (
          <Section
            title={data.showNearbySpaces ? 'Spaces near you' : 'Explore spaces'}
            subtitle="Clubs, communities and organisers"
            onSeeAll={() => router.push('/spaces')}
          >
            <Rail>
              {data.isLoadingDiscoverSpaces
                ? [0, 1, 2].map((i) => <SpaceCardSkeleton key={i} />)
                : data.discoverSpaces.map((s) => <SpaceCard key={s.id} space={s} onPress={() => openSpace(s)} />)}
            </Rail>
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
                // One space I can create in: straight into the form. Otherwise pick on the Space tab.
                workspace.adminSpaceIds.length === 1
                  ? router.push(`/manage/space/${workspace.adminSpaceIds[0]}/new-event`)
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
});
