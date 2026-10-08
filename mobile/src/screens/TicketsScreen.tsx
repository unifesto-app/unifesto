import React, { useCallback, useEffect, useRef } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedRef, useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Hourglass, Ticket, XCircle, ClockCounterClockwise } from '@unifesto/unicon/react-native';
import { useStableTopInset } from '../components/CustomHeader';
import { useTokens } from '../context/ThemeContext';
import BrandGlow from '../components/ui/BrandGlow';
import { Button } from '../components/ui';
import { ALL_TABS, canDeleteTicket, useMyTickets, type MyTicket, type TicketTab } from '../hooks/useMyTickets';
import TicketTabs from '../components/tickets/TicketTabs';
import TicketCard, { TicketCardSkeleton } from '../components/tickets/TicketCard';
import WaitlistCard from '../components/tickets/WaitlistCard';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

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
  const tokens = useTokens();
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

  // Tab changed from outside a drag (tap, or "Spot confirmed" → Upcoming).
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
      <Text style={[styles.title, { color: tokens.text }]}>My tickets</Text>
    </View>
  );

  const renderEmpty = (tab: TicketTab) => {
    const e = EMPTY[tab];
    const Icon = e.icon;
    return (
      <View style={styles.empty}>
        <View style={styles.emptyIcon}>
          <Icon size={40} color={tokens.textSecondary} weight="duotone" />
        </View>
        <Text style={[styles.emptyTitle, { color: tokens.text }]}>{e.title}</Text>
        <Text style={[styles.emptyBody, { color: tokens.textMuted }]}>{e.body}</Text>
        {e.cta ? (
          <Button label={e.cta} onPress={() => router.navigate('/(tabs)')} style={{ marginTop: spacing[5], alignSelf: 'center' }} />
        ) : null}
      </View>
    );
  };

  // ── Guest ────────────────────────────────────────────────────────────────
  if (!t.user) {
    return (
      <View style={[styles.container, { backgroundColor: tokens.bg }]}>
        <BrandGlow />
        <ScrollView contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} contentContainerStyle={{ flexGrow: 1 }}>
          {header}
          <View style={styles.guest}>
            <View style={styles.guestIcon}>
              <Ticket size={48} color={tokens.accent} weight="duotone" />
            </View>
            <Text style={[styles.guestTitle, { color: tokens.text }]}>Every pass, one place</Text>
            <Text style={[styles.emptyBody, { color: tokens.textMuted }]}>
              Sign in to register for events and keep your tickets ready for the door.
            </Text>
            <Button label="Sign in" size="lg" onPress={() => router.push('/login')} fullWidth style={{ marginTop: spacing[6], alignSelf: 'stretch' }} />
            <Text
              style={[styles.browse, { color: tokens.textSecondary }]}
              onPress={() => router.navigate('/(tabs)')}
              accessibilityRole="link"
            >
              Browse events
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Signed in ────────────────────────────────────────────────────────────
  const renderBody = (tab: TicketTab) => {
    if (tab === 'waitlist') {
      if (t.waitlistLoading && t.refreshing !== 'waitlist') return <Skeletons />;
      return t.waitlist.length > 0 ? (
        <View style={styles.list}>
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
    if (list.loading && t.refreshing !== tab) return <Skeletons />;
    if (list.items.length === 0) return renderEmpty(tab);

    return (
      <>
        {groupByMonth(list.items).map((group) => (
          <View key={group.label} style={styles.group}>
            <Text style={[styles.groupLabel, { color: tokens.textMuted }]}>{group.label}</Text>
            <View style={styles.list}>
              {group.items.map((ticket) => (
                <TicketCard
                  key={ticket.registrationId || ticket.id}
                  ticket={ticket}
                  onPress={() => openTicket(ticket)}
                  // Long-press a finished ticket to delete it from the list.
                  onLongPress={canDeleteTicket(ticket) ? () => t.confirmDelete(ticket) : undefined}
                />
              ))}
            </View>
          </View>
        ))}
        {list.loadingMore ? (
          <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[6] }} />
        ) : null}
      </>
    );
  };

  // A plain View wraps the scroll views so the native tab host doesn't add
  // its own safe-area inset on top of the header's (see mobile-tab-top-spacing).
  // Title + tabs stay put; below them a horizontal pager holds one vertically
  // scrolling page per tab, so a finger drag slides the neighbouring tab in.
  return (
    <View style={[styles.container, { backgroundColor: tokens.bg }]}>
      <BrandGlow />
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
            contentContainerStyle={{ paddingHorizontal: GUTTER, paddingTop: spacing[3], paddingBottom: 120 }}
            refreshControl={
              <RefreshControl
                refreshing={t.refreshing === tab}
                onRefresh={() => t.onRefresh(tab)}
                tintColor={tokens.accent}
                colors={[tokens.accent]}
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
  title: {
    fontSize: typography.fontSize['4xl'],
    lineHeight: typography.fontSize['4xl'] * 1.1,
    letterSpacing: -0.8,
    ...font('heading'),
  },
  list: { gap: spacing[3] },
  group: { marginBottom: spacing[6] },
  groupLabel: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing[3],
    ...font('semibold'),
  },
  empty: { alignItems: 'center', paddingTop: spacing[12], paddingHorizontal: spacing[4] },
  emptyIcon: { marginBottom: spacing[4] },
  emptyTitle: { fontSize: typography.fontSize.lg, textAlign: 'center', ...font('heading') },
  emptyBody: {
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    textAlign: 'center',
    marginTop: 6,
    maxWidth: 300,
    ...font(),
  },
  guest: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: GUTTER, paddingBottom: 120 },
  guestIcon: { marginBottom: spacing[5] },
  guestTitle: { fontSize: typography.fontSize['2xl'], textAlign: 'center', ...font('heading') },
  browse: { marginTop: spacing[5], fontSize: typography.fontSize.sm, ...font('semibold') },
});
