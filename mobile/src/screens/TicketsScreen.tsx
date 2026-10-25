import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Confetti, Hourglass, Ticket, XCircle, ClockCounterClockwise } from '@unifesto/unicon/react-native';
import { useStableTopInset } from '../components/CustomHeader';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import { GUTTER } from '../components/home/Section';
import PromptCard from '../components/home/PromptCard';
import { ALL_TABS, canDeleteTicket, useMyTickets, type MyTicket, type TicketTab } from '../hooks/useMyTickets';
import TicketTabs from '../components/tickets/TicketTabs';
import TicketCard, { TicketCardSkeleton } from '../components/tickets/TicketCard';
import NextPassCard, { NextPassCardSkeleton } from '../components/tickets/NextPassCard';
import WaitlistCard from '../components/tickets/WaitlistCard';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

/** Bucket tickets under "October 2026"-style headers, preserving order. */
function groupByMonth(tickets: MyTicket[]) {
  const groups: { label: string; items: MyTicket[] }[] = [];
  for (const t of tickets) {
    const label = new Date(t.startDateTime).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(t);
    else groups.push({ label, items: [t] });
  }
  return groups;
}

const EMPTY: Record<TicketTab, { icon: React.ComponentType<any>; title: string; body: string; cta?: string }> = {
  upcoming: { icon: Ticket, title: 'No tickets yet', body: 'Register for an event and your pass shows up here, ready for the door.', cta: 'Find events' },
  past: { icon: ClockCounterClockwise, title: 'Nothing here yet', body: 'Events you have been to will collect here.' },
  waitlist: { icon: Hourglass, title: 'Not waiting on anything', body: 'When a ticket sells out you can join its waiting list, and it shows up here.' },
  cancelled: { icon: XCircle, title: 'No cancelled tickets', body: 'Tickets you cancel or get refunded for show up here.' },
};

export default function TicketsScreen() {
  const c = useCosmos();
  const topInset = useStableTopInset();
  const router = useRouter();
  const t = useMyTickets();
  const { width } = useWindowDimensions();
  const pager = useAnimatedRef<Animated.ScrollView>();
  // Fractional page index, written on the UI thread as the pager scrolls; the
  // tab pill reads it so it tracks the finger frame by frame.
  const position = useSharedValue(0);
  const lastIndex = useSharedValue(0);
  // Page the pager is showing, and the page a tab tap is scrolling towards
  // (while set, pages passed on the way don't flip the selected tab).
  const shownIndex = useRef(0);
  const scrollTarget = useRef<number | null>(null);

  // Tab changed from outside a drag (tap, offer nudge, or "Spot confirmed" → Upcoming).
  useEffect(() => {
    const index = ALL_TABS.indexOf(t.tab);
    if (index === shownIndex.current) return;
    scrollTarget.current = index;
    pager.current?.scrollTo({ x: index * width, animated: true });
  }, [t.tab, width, pager]);

  // Runs on the JS thread only when the nearest page changes, not per frame.
  const onPageChange = useRef((_index: number) => {});
  onPageChange.current = (index: number) => {
    shownIndex.current = index;
    if (scrollTarget.current !== null) {
      if (index === scrollTarget.current) scrollTarget.current = null;
      return;
    }
    // Past halfway through a drag: select the incoming tab (label colours).
    if (ALL_TABS[index] !== t.tab) t.setTab(ALL_TABS[index]);
  };
  const pageChanged = useCallback((index: number) => onPageChange.current(index), []);
  const dragStarted = useCallback(() => {
    scrollTarget.current = null;
  }, []);

  const onPagerScroll = useAnimatedScrollHandler({
    onBeginDrag: () => {
      scheduleOnRN(dragStarted);
    },
    onScroll: (e) => {
      if (width <= 0) return;
      const p = Math.max(0, Math.min(ALL_TABS.length - 1, e.contentOffset.x / width));
      position.value = p;
      const index = Math.round(p);
      if (index !== lastIndex.value) {
        lastIndex.value = index;
        scheduleOnRN(pageChanged, index);
      }
    },
  });

  const openTicket = (ticket: MyTicket) =>
    router.push({
      pathname: '/ticket/[id]',
      params: {
        id: ticket.id,
        ticket: JSON.stringify({
          ...ticket,
          qrCode: ticket.qrCode,
          ticketType: ticket.ticketType,
          registrationId: ticket.registrationId,
          registrationStatus: ticket.registrationStatus,
        }),
      },
    });

  const header = (
    <View style={{ paddingTop: topInset + spacing[4], paddingHorizontal: GUTTER }}>
      <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>My tickets</Text>
    </View>
  );

  const renderEmpty = (tab: TicketTab) => {
    const e = EMPTY[tab];
    const Icon = e.icon;
    return (
      <View style={styles.empty}>
        <Icon size={44} color={c.soft} weight="duotone" accessibilityElementsHidden importantForAccessibility="no" />
        <Text accessibilityRole="header" style={[styles.emptyTitle, { color: c.text }]}>{e.title}</Text>
        <Text style={[styles.emptyBody, { color: c.muted }]}>{e.body}</Text>
        {e.cta ? (
          <AuthButton label={e.cta} arrow onPress={() => router.navigate('/(tabs)')} style={styles.emptyCta} />
        ) : null}
      </View>
    );
  };

  // ── Guest ────────────────────────────────────────────────────────────────
  if (!t.user) {
    return (
      <View style={[styles.container, { backgroundColor: c.bg }]}>
        <CosmosBackdrop horizon={false} />
        <ScrollView contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} contentContainerStyle={{ flexGrow: 1 }}>
          {header}
          <View style={[styles.guest, { backgroundColor: c.raised }]}>
            <View style={[styles.rule, { backgroundColor: `rgba(${c.glow}, 0.7)` }]} />
            <Text accessibilityRole="header" style={[styles.guestTitle, { color: c.text }]}>Every pass, one place</Text>
            <Text style={[styles.guestBody, { color: c.soft }]}>
              Sign in to register for events and keep your tickets ready for the door.
            </Text>
            <AuthButton label="Sign in" arrow onPress={() => router.push('/login')} style={{ marginTop: spacing[6] }} />
            <AuthButton label="Browse events" variant="secondary" onPress={() => router.navigate('/(tabs)')} style={{ marginTop: spacing[3] }} />
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Signed in ────────────────────────────────────────────────────────────
  const ticketCard = (ticket: MyTicket) => (
    <TicketCard
      key={ticket.registrationId || ticket.id}
      ticket={ticket}
      onPress={() => openTicket(ticket)}
      // Long-press a finished ticket to delete it from the list.
      onLongPress={canDeleteTicket(ticket) ? () => t.confirmDelete(ticket) : undefined}
    />
  );

  const monthGroups = (items: MyTicket[]) =>
    groupByMonth(items).map((group) => (
      <View key={group.label} style={styles.group}>
        <Text accessibilityRole="header" style={[styles.label, { color: c.muted }]}>{group.label}</Text>
        <View style={styles.list}>{group.items.map(ticketCard)}</View>
      </View>
    ));

  // A spot the organiser offered off a waiting list is time-sensitive, so it
  // surfaces on Upcoming too instead of waiting for someone to open Waitlist.
  const offers = t.waitlist.filter((e) => e.waitlistStatus === 'OFFERED' && e.offer);
  const offerNudge = offers.length > 0 ? (
    <View style={{ marginBottom: spacing[6] }}>
      <PromptCard
        icon={<Confetti size={24} color={c.text} />}
        title="A spot opened up"
        body={offers.length === 1 ? `${offers[0].event.title}. Confirm it to keep your seat.` : `${offers.length} waiting lists have a seat for you.`}
        onPress={() => t.setTab('waitlist')}
      />
    </View>
  ) : null;

  const renderBody = (tab: TicketTab) => {
    if (tab === 'waitlist') {
      if (t.waitlistLoading && t.refreshing !== 'waitlist') return <View style={styles.pad} accessible accessibilityLabel="Loading waitlist"><Skeletons /></View>;
      return t.waitlist.length > 0 ? (
        <View style={[styles.pad, styles.list]}>
          {t.waitlist.map((entry) => (
            <WaitlistCard
              key={entry.registrationId}
              entry={entry}
              busy={t.payingId === entry.registrationId}
              onPay={() => t.payForOffer(entry)}
              onLeave={() => t.confirmLeave(entry)}
            />
          ))}
        </View>
      ) : (
        renderEmpty('waitlist')
      );
    }

    const list = t.lists[tab];
    if (list.loading && t.refreshing !== tab) {
      return (
        <View style={[styles.pad, styles.list]} accessible accessibilityLabel="Loading tickets">
          {tab === 'upcoming' ? <NextPassCardSkeleton /> : null}
          <Skeletons />
        </View>
      );
    }
    if (list.items.length === 0) {
      return tab === 'upcoming' ? <>{offerNudge}{renderEmpty(tab)}</> : renderEmpty(tab);
    }

    // Upcoming leads with the next pass, big; the rest follow by month.
    const [next, ...later] = tab === 'upcoming' ? list.items : [null, ...list.items];
    return (
      <>
        {tab === 'upcoming' ? offerNudge : null}
        <View style={styles.pad}>
          {next ? (
            <View style={styles.group}>
              <Text accessibilityRole="header" style={[styles.label, { color: c.soft }]}>Up next</Text>
              <NextPassCard ticket={next} onPress={() => openTicket(next)} />
            </View>
          ) : null}
          {monthGroups(later)}
          {list.loadingMore ? <ActivityIndicator color={c.text} style={{ marginTop: spacing[2] }} /> : null}
        </View>
      </>
    );
  };

  // A plain View wraps the scroll views so the native tab host doesn't add
  // its own safe-area inset on top of the header's (see mobile-tab-top-spacing).
  // Title + tabs stay put; below them a horizontal pager holds one vertically
  // scrolling page per tab, so a finger drag slides the neighbouring tab in.
  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      {header}
      <View style={{ paddingHorizontal: GUTTER, marginTop: spacing[5], marginBottom: spacing[2] }}>
        <TicketTabs value={t.tab} onChange={t.setTab} position={position} />
      </View>
      <Animated.ScrollView
        ref={pager}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        keyboardShouldPersistTaps="handled"
        onScroll={onPagerScroll}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
      >
        {ALL_TABS.map((tab) => (
          <ScrollView
            key={tab}
            style={{ width }}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingTop: spacing[4], paddingBottom: 140 }}
            refreshControl={
              <RefreshControl
                refreshing={t.refreshing === tab}
                onRefresh={() => t.onRefresh(tab)}
                tintColor={c.text}
                colors={[c.text]}
              />
            }
            onScroll={({ nativeEvent }) => {
              const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
              if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 200) t.loadMore(tab);
            }}
            scrollEventThrottle={400}
          >
            {renderBody(tab)}
          </ScrollView>
        ))}
      </Animated.ScrollView>
    </View>
  );
}

function Skeletons() {
  return (
    <View style={styles.list}>
      {[0, 1, 2].map((i) => <TicketCardSkeleton key={i} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  pad: { paddingHorizontal: GUTTER },
  title: { fontSize: 26, lineHeight: 34, ...cosmosFont.display },
  list: { gap: spacing[3] },
  group: { marginBottom: spacing[8] },
  label: { fontSize: typography.fontSize.sm, marginBottom: spacing[3], ...cosmosFont.strong },
  empty: { alignItems: 'center', paddingTop: spacing[12], paddingHorizontal: GUTTER + spacing[4] },
  emptyTitle: { marginTop: spacing[4], fontSize: 17, lineHeight: 24, textAlign: 'center', ...cosmosFont.display },
  emptyBody: {
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    textAlign: 'center',
    marginTop: spacing[2],
    maxWidth: 300,
    ...cosmosFont.body,
  },
  emptyCta: { marginTop: spacing[6], alignSelf: 'stretch' },
  rule: { width: 40, height: 1, marginBottom: spacing[5] },
  guest: { marginHorizontal: GUTTER, marginTop: spacing[6], borderRadius: cosmosCardRadius, padding: spacing[6] },
  guestTitle: { fontSize: 20, lineHeight: 28, ...cosmosFont.display },
  guestBody: { marginTop: spacing[3], fontSize: typography.fontSize.base, lineHeight: 22, ...cosmosFont.body },
});
