import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { RefreshControl } from '../../src/components/ui/RefreshControl';
import { useRouter } from 'expo-router';
import { IdentificationCard, Sparkle, UserCircle } from 'phosphor-react-native';
import { useTokens } from '../../src/context/ThemeContext';
import { useStableTopInset } from '../../src/components/CustomHeader';
import BrandGlow from '../../src/components/ui/BrandGlow';
import { useHomeData } from '../../src/hooks/useHomeData';
import { useHomeSearch } from '../../src/hooks/useHomeSearch';
import type { Event } from '../../src/lib/api/events';
import { type Session } from '../../src/lib/api/sessions';
import HomeHeader from '../../src/components/home/HomeHeader';
import { Rail, Section } from '../../src/components/home/Section';
import HeroCarousel from '../../src/components/home/HeroCarousel';
import UpNextCard, { UpNextCardSkeleton } from '../../src/components/home/UpNextCard';
import InviteCards from '../../src/components/home/InviteCards';
import { useMyInvites } from '../../src/hooks/useMyInvites';
import PromptCard from '../../src/components/home/PromptCard';
import SpacePanel from '../../src/components/home/SpacePanel';
import ApexPanel from '../../src/components/home/ApexPanel';
import { useWorkspaceCards } from '../../src/hooks/useWorkspaceCards';
import PosterCard, { PosterCardSkeleton } from '../../src/components/home/PosterCard';
import VibeRail, { VibeRailSkeleton } from '../../src/components/home/VibeRail';
import { CircleRow, SpaceCard, SpaceCardSkeleton } from '../../src/components/home/SpaceCards';
import BeyondFeature, { BeyondFeatureSkeleton } from '../../src/components/home/BeyondFeature';
import SearchSheet from '../../src/components/home/SearchSheet';
import { relativeWhen, shortPrice } from '../../src/utils/eventFormat';
import { spacing } from '../../src/theme/spacing';

export default function HomeTab() {
  const router = useRouter();
  const tokens = useTokens();
  const topInset = useStableTopInset();
  const data = useHomeData();
  // Group-seat invites waiting for me (refetched on focus).
  const myInvites = useMyInvites();
  const search = useHomeSearch();
  // Shortcuts into the Space / Apex tabs, shown only to people who have them.
  const workspace = useWorkspaceCards();
  const { user, profile } = data;

  const firstName = user
    ? (profile?.fullName || user.fullName || profile?.username || user.username || '').split(' ')[0] || 'there'
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
      where={e.venueName || e.city || e.space?.name}
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
        where={s.space?.name}
        price={price > 0 ? `₹${price.toLocaleString('en-IN')}` : 'Free'}
        onPress={() => openSession(s)}
      />
    );
  };

  const posterSkeletons = [0, 1].map((i) => <PosterCardSkeleton key={i} />);

  // At most one nudge, in priority order: sign in → username → full name.
  const prompt = !user
    ? { icon: <Sparkle size={20} color={tokens.accent} weight="fill" />, title: 'Sign in to get tickets', body: 'Save events and keep every pass here.', to: '/login' as const }
    : profile && !profile.username
      ? { icon: <IdentificationCard size={20} color={tokens.accent} weight="fill" />, title: 'Pick a username', body: 'So friends and organisers can find you.', to: '/account' as const }
      : profile && !profile.fullName
        ? { icon: <UserCircle size={20} color={tokens.accent} weight="fill" />, title: 'Finish your profile', body: 'Add your name before you register.', to: '/edit-profile' as const }
        : null;

  const nextTicket = data.upcomingTickets[0];

  // A plain View wraps the ScrollView so it is NOT the screen's root
  // scrollable: that stops the native tab host from auto-adding the safe-area
  // top inset on top of the header's own spacing (see mobile-tab-top-spacing).
  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <BrandGlow />
      <ScrollView
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={data.refreshing}
            onRefresh={() => {
              void myInvites.refresh();
              workspace.refresh();
              data.onRefresh();
            }}
            tintColor={tokens.accent}
            colors={[tokens.accent]}
            progressViewOffset={topInset}
          />
        }
      >
        <HomeHeader
          firstName={firstName}
          avatarUrl={profile?.avatarUrl}
          city={data.detectedCity}
          locationStatus={data.locationStatus}
          onEnableLocation={data.loadLocation}
          onPressAvatar={() => router.navigate('/profile')}
          onPressSearch={search.openSheet}
        />

        {myInvites.invites.length > 0 ? (
          <View style={styles.block}>
            <InviteCards invites={myInvites.invites} onOpen={(t) => router.push(`/claim/${t}`)} onDismiss={myInvites.dismiss} />
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

        {workspace.showSpace ? (
          <Section title="My space" onSeeAll={() => router.navigate('/space')}>
            <SpacePanel
              liveCheckins={workspace.liveCheckins}
              upcoming={workspace.upcoming}
              loadingUpcoming={workspace.loadingUpcoming}
              hosting={workspace.hostedSpaceIds.length > 0}
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
                // One space: straight into the form. Several: let me pick on the Space tab.
                workspace.hostedSpaceIds.length === 1
                  ? router.push(`/manage/space/${workspace.hostedSpaceIds[0]}/new-event`)
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

        {prompt ? (
          <View style={styles.block}>
            <PromptCard icon={prompt.icon} title={prompt.title} body={prompt.body} onPress={() => router.push(prompt.to)} />
          </View>
        ) : null}

        <Section title={data.detectedCity ? 'Happening near you' : 'Happening soon'} onSeeAll={() => router.push('/events')}>
          <HeroCarousel events={data.heroEvents} loading={data.isLoadingHero} onPressEvent={openEvent} />
        </Section>

        {data.isLoadingCategories || data.categories.length > 0 ? (
          <Section title="Find your vibe" onSeeAll={() => router.push('/events')}>
            {data.isLoadingCategories && data.categories.length === 0 ? (
              <VibeRailSkeleton />
            ) : (
              <VibeRail categories={data.categories} onPressCategory={openCategory} />
            )}
          </Section>
        ) : null}

        {user && (data.isLoadingFavorites || data.favoriteEvents.length > 0) ? (
          <Section title="My shortlist" onSeeAll={() => router.push('/favorites')}>
            <Rail>{data.isLoadingFavorites ? posterSkeletons : data.favoriteEvents.map(eventPoster)}</Rail>
          </Section>
        ) : null}

        {user && (data.isLoadingMySpaces || data.mySpaces.length > 0) ? (
          <Section title="My circles" onSeeAll={() => router.push({ pathname: '/spaces', params: { mine: 'true' } })}>
            <CircleRow spaces={data.mySpaces} loading={data.isLoadingMySpaces} onPress={openSpace} />
          </Section>
        ) : null}

        {data.isLoadingSessions || data.sessions.length > 0 ? (
          <Section title="Live sessions" subtitle="Online talks and workshops" onSeeAll={() => router.push('/sessions')}>
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
