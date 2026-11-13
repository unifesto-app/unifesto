import React, { useEffect } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Confetti, Hourglass, Ticket, XCircle, ClockCounterClockwise } from '../components/ui/icons';
import { useStableTopInset } from '../components/CustomHeader';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import AuthButton from '../components/auth/AuthButton';
import { GUTTER } from '../components/home/Section';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { ALL_TABS, canDeleteTicket, useMyTickets, type MyTicket, type TicketTab } from '../hooks/useMyTickets';
import TabPager from '../components/ui/TabPager';
import TicketCard, { TicketCardSkeleton } from '../components/tickets/TicketCard';
import NextPassCard, { NextPassCardSkeleton } from '../components/tickets/NextPassCard';
import WaitlistCard from '../components/tickets/WaitlistCard';
import { column, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';

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

const TICKET_TABS: { key: TicketTab; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'waitlist', label: 'Waitlist' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
];

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
  // Q10: a waitlist-offer push lands with ?tab=waitlist: open that tab with the
  // offer's Pay card fresh, then drop the param so the next push works too.
  const { tab: linkedTab } = useLocalSearchParams<{ tab?: string }>();
  useEffect(() => {
    if (!linkedTab || !ALL_TABS.includes(linkedTab as TicketTab)) return;
    t.setTab(linkedTab as TicketTab);
    void t.onRefresh(linkedTab as TicketTab);
    router.setParams({ tab: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedTab]);
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
    <View style={[column, { paddingTop: topInset + spacing[4], paddingHorizontal: GUTTER }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: c.text }]}>My tickets</Text>
    </View>
  );

  const renderEmpty = (tab: TicketTab) => {
    const e = EMPTY[tab];
    const Icon = e.icon;
    return (
      <View style={styles.empty}>
        <Icon size={44} color={c.muted} weight="duotone" accessibilityElementsHidden importantForAccessibility="no" />
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
        <ScrollView contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} contentContainerStyle={[column, { flexGrow: 1 }]}>
          {header}
          {/* An empty state straight on the page: one headline, one line, one button. */}
          <View style={styles.empty}>
            <Ticket size={44} color={c.muted} weight="duotone" accessibilityElementsHidden importantForAccessibility="no" />
            <Text accessibilityRole="header" style={[styles.emptyTitle, { color: c.text }]}>Every pass, one place</Text>
            <Text style={[styles.emptyBody, { color: c.muted }]}>
              Sign in to register for events and keep your tickets ready for the door.
            </Text>
            <AuthButton label="Sign in" arrow onPress={() => router.push('/login')} style={styles.emptyCta} />
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
  // An action, so it's a sky row on the page (as Profile's nudge), with the detail as its value.
  const offerNudge = offers.length > 0 ? (
    <SettingsGroup flat style={styles.nudge}>
      <SettingsRow
        icon={<Confetti size={28} color={c.sky} />}
        label="A spot opened up"
        value={offers.length === 1 ? offers[0].event.title : `${offers.length} waiting lists`}
        accent={c.sky}
        onPress={() => t.setTab('waitlist')}
      />
    </SettingsGroup>
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
              <Text accessibilityRole="header" style={[styles.label, { color: c.muted }]}>Up next</Text>
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
      <TabPager
        tabs={TICKET_TABS}
        value={t.tab}
        onChange={t.setTab}
        tabsStyle={[column, { paddingHorizontal: GUTTER, marginTop: spacing[5], marginBottom: spacing[2] }]}
        renderPage={(tab) => (
          <ScrollView
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[column, { paddingTop: spacing[4], paddingBottom: 140 }]}
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
        )}
      />
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
  title: { fontSize: typography.fontSize['3xl'], lineHeight: 34, ...cosmosFont.display, letterSpacing: displayTracking(28) },
  list: { gap: spacing[3] },
  group: { marginBottom: spacing[8] },
  label: { fontSize: typography.fontSize.sm, marginBottom: spacing[3], ...cosmosFont.strong },
  empty: { alignItems: 'center', paddingTop: spacing[12], paddingHorizontal: GUTTER + spacing[4] },
  emptyTitle: { marginTop: spacing[4], fontSize: 24, lineHeight: 30, textAlign: 'center', ...cosmosFont.display, letterSpacing: displayTracking(24) },
  emptyBody: {
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.5,
    textAlign: 'center',
    marginTop: spacing[2],
    maxWidth: 300,
    ...cosmosFont.body,
  },
  emptyCta: { marginTop: spacing[6], alignSelf: 'stretch' },
  nudge: { marginTop: 0, marginBottom: spacing[4], marginHorizontal: GUTTER },
});
