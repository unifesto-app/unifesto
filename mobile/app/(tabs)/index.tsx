import React from 'react';
import { Linking, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { RefreshControl } from '../../src/components/ui/RefreshControl';
import { useRouter } from 'expo-router';
import { Buildings, IdentificationCard, QrCode, ShieldCheck, Sparkle, Ticket, Trophy, UserCircle, UsersThree } from '../../src/components/ui/icons';
import { useStableTopInset } from '../../src/components/CustomHeader';
import CosmosBackdrop from '../../src/components/ui/CosmosBackdrop';
import { useCosmos } from '../../src/theme/cosmos';
import { composeHome, useHomeData } from '../../src/hooks/useHomeData';
import { useHomeSearch } from '../../src/hooks/useHomeSearch';
import type { Event } from '../../src/lib/api/events';
import { HOME_BAR_H, HomeBar, HomeHeadline } from '../../src/components/home/HomeHeader';
import { GUTTER, Section } from '../../src/components/home/Section';
import DayRows, { ActionRow, EventHero, EventHeroSkeleton, EventRow, EventRowSkeleton } from '../../src/components/home/EventRows';
import UpNextCard, { UpNextCardSkeleton } from '../../src/components/home/UpNextCard';
import HackathonCard, { statusLine, useMyHackathon } from '../../src/components/home/HackathonCard';
import type { CheckinEvent } from '../../src/lib/api/checkin';
import InviteCards from '../../src/components/home/InviteCards';
import { useMyInvites } from '../../src/hooks/useMyInvites';
import { useUnreadNotifications } from '../../src/hooks/useUnreadNotifications';
import PromptCard from '../../src/components/home/PromptCard';
import { LinkRow, LiveCheckinCard, Rows } from '../../src/components/home/SpacePanel';
import { useWorkspaceCards } from '../../src/hooks/useWorkspaceCards';
import VibeRail, { VibeRailSkeleton } from '../../src/components/home/VibeRail';
import HostCta from '../../src/components/home/HostCta';
import SearchSheet from '../../src/components/home/SearchSheet';
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
  // Content is under the pinned bar, so it turns glass.
  const [scrolled, setScrolled] = React.useState(false);
  // Live check-ins and the Space / Apex rows, shown only to people who have those tabs.
  const workspace = useWorkspaceCards();
  const { user, profile } = data;

  // ── Navigation ──────────────────────────────────────────────────────────
  const openEvent = (e: Pick<Event, 'id' | 'slug'>) => router.push(`/event/${e.slug || e.id}`);
  const openSpace = (s: { id: string }) => router.push(`/space/${s.id}`);
  const openCategory = (name: string) => router.push({ pathname: '/events', params: { category: name } });
  const openSpaces = () => router.push('/spaces');

  // ── What each list shows: every event once (see composeHome) ───────────
  // Nothing coming up in my spaces (or none joined): the space Apex features instead.
  const { spotlight, spotlightFromSpaces, fromMySpaces, featured, shortlist, nearYou } = composeHome({
    tickets: data.upcomingTickets,
    invitedEventIds: myInvites.invites.map((i) => i.event.id),
    checkinEventIds: workspace.liveCheckins.map((e) => e.id),
    spaceEvents: data.spaceEvents,
    featuredEvents: data.featuredSpace ? data.featuredEvents : [],
    favorites: data.favoriteEvents,
    feed: data.feedEvents,
  });
  const feedLoading = data.isLoadingFeed || myInvites.loading;
  // The space list shows once what it skips has loaded (not the location fix),
  // then stays put through refreshes. Per person: signing in waits again.
  const userKey = user?.id ?? 'out';
  // On sign-in or out the hooks reset their loading flags during render, so one
  // pass still sees the last person's "loaded": nothing settles until the flags are this person's.
  const flagsAreMine = data.loadsFor === (user?.id ?? null);
  const spacesSettledFor = React.useRef<string | null>(null);
  if (flagsAreMine && !data.isLoadingSpaceLists && !myInvites.loading) spacesSettledFor.current = userKey;
  const spacesSettled = spacesSettledFor.current === userKey;
  // A spotlight from the space lists is final with them; a near-you pick waits for the whole feed.
  const spotlightSettledFor = React.useRef<string | null>(null);
  if (flagsAreMine && (!feedLoading || (spacesSettled && spotlightFromSpaces))) spotlightSettledFor.current = userKey;
  const spotlightSettled = spotlightSettledFor.current === userKey;

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

  // ── Now: the one thing that can't wait is a card, the rest are rows under it ──
  // A check-in I'm running, my hackathon while it runs, my next ticket, then my
  // hackathon before kickoff, seat invites, and the one profile nudge.
  const scan = (e: CheckinEvent) =>
    router.push({
      pathname: `/checkin/${e.id}`,
      params: { title: e.title, startDateTime: e.startDateTime, venueName: e.venueName || e.city || '' },
    });
  const openTicket = () =>
    nextTicket && router.push({ pathname: '/ticket/[id]', params: { id: nextTicket.id, ticket: JSON.stringify(nextTicket) } });
  const openHackathon = () => hackathon && router.push(`/hackathon/${hackathon.eventId}` as never);
  const nowMs = Date.now();
  const hackathonLive =
    !!hackathon && Date.parse(hackathon.event.startDateTime) <= nowMs && nowMs < Date.parse(hackathon.event.endDateTime);
  const hackathonItem = hackathon
    ? {
        key: 'hackathon',
        card: <HackathonCard hub={hackathon} onPress={openHackathon} />,
        row: (
          <LinkRow
            key="hackathon"
            icon={<Trophy size={24} color={c.text} />}
            title={hackathon.event.title}
            meta={statusLine(hackathon.team!, hackathon.unreadCount)}
            onPress={openHackathon}
          />
        ),
      }
    : null;
  const nowItems = [
    ...workspace.liveCheckins.map((e) => ({
      key: `checkin-${e.id}`,
      card: (
        <View style={styles.cards}>
          <LiveCheckinCard event={e} onScan={() => scan(e)} />
        </View>
      ),
      row: <LinkRow key={`checkin-${e.id}`} icon={<QrCode size={24} color={c.mint} />} title={e.title} meta="Check-in live" onPress={() => scan(e)} />,
    })),
    hackathonLive ? hackathonItem : null,
    nextTicket
      ? {
          key: 'next',
          card: (
            <UpNextCard
              ticket={nextTicket}
              moreCount={data.upcomingTickets.length - 1}
              onOpenTicket={openTicket}
              onSeeAllTickets={() => router.navigate('/tickets')}
            />
          ),
          row: (
            <LinkRow
              key="next"
              icon={<Ticket size={24} color={c.sky} />}
              title={nextTicket.title}
              meta={`Up next · ${relativeWhen(nextTicket.startDateTime)}`}
              onPress={openTicket}
            />
          ),
        }
      : // Skeleton only until the first answer: on pull-to-refresh the stale card stays put.
        data.isLoadingTickets
        ? { key: 'next', card: <UpNextCardSkeleton />, row: null }
        : null,
    hackathonLive ? null : hackathonItem,
    ...myInvites.invites.slice(0, 3).map((inv) => ({
      key: `invite-${inv.token}`,
      card: <InviteCards invites={[inv]} onOpen={(t) => router.push(`/claim/${t}`)} onDecline={myInvites.decline} />,
      row: (
        <LinkRow
          key={`invite-${inv.token}`}
          icon={<Ticket size={24} color={c.sky} />}
          title={inv.event.title}
          meta={inv.invitedBy ? `${inv.invitedBy} saved you a seat` : 'You have a seat waiting'}
          onPress={() => router.push(`/claim/${inv.token}`)}
        />
      ),
    })),
    prompt
      ? {
          key: 'prompt',
          card: <PromptCard icon={prompt.icon} title={prompt.title} body={prompt.body} onPress={() => router.push(prompt.to)} />,
          row: <LinkRow key="prompt" icon={prompt.icon} title={prompt.title} meta={prompt.body} onPress={() => router.push(prompt.to)} />,
        }
      : null,
  ].filter((item) => item !== null);
  const [nowCard, ...afterCard] = nowItems;
  // The Up next skeleton has no row: below the card it shows nothing.
  const nowRest = afterCard.filter((item) => item.row);

  // A plain View wraps the ScrollView so it is NOT the screen's root
  // scrollable: that stops the native tab host from auto-adding the safe-area
  // top inset on top of the header's own spacing (see mobile-tab-top-spacing).
  // The bar is the ScrollView's sticky first child, so that stays true.
  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <ScrollView
        contentContainerStyle={[column, styles.content]}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        showsVerticalScrollIndicator={false}
        stickyHeaderIndices={[0]}
        // Re-renders only when content starts or stops sliding under the bar.
        onScroll={(e) => setScrolled(e.nativeEvent.contentOffset.y > 1)}
        scrollEventThrottle={16}
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
            // Android draws the spinner over content, so it clears the bar; iOS draws it
            // behind content, where the bar moves down with the pull.
            progressViewOffset={Platform.OS === 'android' ? topInset + HOME_BAR_H : topInset}
          />
        }
      >
        <HomeBar
          signedIn={!!user}
          unread={unread}
          onPressBell={() => router.push('/notifications')}
          onPressSearch={search.openSheet}
          scrolled={scrolled}
        />
        <HomeHeadline
          city={city}
          locationStatus={data.locationStatus}
          onEnableLocation={() => (data.canAskLocation ? void data.loadLocation() : void Linking.openSettings())}
        />

        {nowCard ? (
          <View style={styles.block}>
            {nowCard.card}
            {nowRest.length > 0 ? (
              <View style={[styles.rows, styles.nowRows]}>
                <Rows>{nowRest.map((item) => item.row)}</Rows>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* The one picture that sells, picked before any list so none repeats it. */}
        {!spotlightSettled ? (
          <View style={[styles.block, styles.rows]}>
            <EventHeroSkeleton />
          </View>
        ) : spotlight ? (
          <View style={[styles.block, styles.rows]}>
            <EventHero event={spotlight} onPress={() => openEvent(spotlight)} />
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
        ) : spacesSettled ? (
          // Neither space list showed: keep a way into spaces on the page.
          <View style={[styles.rows, styles.block]}>
            <Rows>
              <LinkRow key="spaces" icon={<UsersThree size={24} color={c.text} />} title="Explore spaces" meta="Clubs, colleges and communities" onPress={openSpaces} />
            </Rows>
          </View>
        ) : null}

        {/* The picture rail sits between the two row lists, so the page isn't one wall of rows. */}
        {data.isLoadingCategories || data.categories.length > 0 ? (
          <Section title="Find your vibe">
            {data.categories.length === 0 ? (
              <VibeRailSkeleton />
            ) : (
              <VibeRail categories={data.categories} onPressCategory={openCategory} />
            )}
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
  nowRows: { marginTop: spacing[2] },
});
