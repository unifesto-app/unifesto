import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CaretLeft, CaretRight, MagnifyingGlass, X } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import { CardBackdrop } from '../components/ui/CardSurface';
import { useEventAttendees } from '../hooks/useEventAttendees';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import AttendeeRow from '../components/manage/AttendeeRow';
import type { AttendeeRow as AttendeeRowData } from '../lib/api/manageEvent';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import type { AttendeeFilter } from '../lib/api/manageEvent';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const TABS: { key: AttendeeFilter; label: string }[] = [
  { key: 'attending', label: 'Attending' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

/** Searchable, paged attendee list for one event (operator view). */
export default function EventAttendeesScreen() {
  // `ticket` + `ticketName` deep-link from a ticket's page to just its holders.
  const { eventId, ticket, ticketName } = useLocalSearchParams<{ eventId: string; ticket?: string; ticketName?: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const a = useEventAttendees(eventId, ticket);
  const list = useRef<FlatList<AttendeeRowData>>(null);

  // A new page starts at its top, not where the last one was scrolled to.
  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [a.page]);

  useAnalyticsScreenTracking('EventAttendees');

  const header = (
    <View style={{ paddingTop: topSpacing }}>
      <View style={styles.search}>
        <CardBackdrop shape={styles.search} />
        <MagnifyingGlass size={20} color={tokens.textMuted} weight="bold" />
        <TextInput
          value={a.query}
          onChangeText={a.setQuery}
          placeholder="Name, phone, email or username"
          placeholderTextColor={tokens.textMuted}
          style={[styles.searchInput, { color: tokens.text }]}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="never"
        />
        {a.query.length > 0 ? (
          <Pressable onPress={() => a.setQuery('')} hitSlop={10} accessibilityLabel="Clear search">
            <X size={18} color={tokens.textSecondary} weight="bold" />
          </Pressable>
        ) : null}
      </View>
      <View style={{ marginTop: spacing[4] }}>
        <SegmentedTabs tabs={TABS} value={a.filter} onChange={a.setFilter} />
      </View>
      {!a.loading && !a.error ? (
        <Text style={[styles.count, { color: tokens.textMuted }]}>
          {a.pageCount > 1
            ? `${a.from.toLocaleString('en-IN')}–${a.to.toLocaleString('en-IN')} of ${a.total.toLocaleString('en-IN')} bookings`
            : `${a.total.toLocaleString('en-IN')} ${a.total === 1 ? 'booking' : 'bookings'}`}
          {ticket ? ` on ${ticketName || 'this ticket'}` : ''}
        </Text>
      ) : null}
    </View>
  );

  const empty = a.loading ? (
    <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[10] }} />
  ) : (
    <Text style={[styles.empty, { color: tokens.textMuted }]}>
      {a.denied
        ? 'The attendee list is only open to Space admins right now.'
        : a.error || (a.query ? 'No one matches that search.' : 'No one here yet.')}
    </Text>
  );

  const canBack = a.page > 1 && !a.paging;
  const canNext = a.page < a.pageCount && !a.paging;
  const pager =
    !a.loading && !a.error && a.pageCount > 1 ? (
      <View style={styles.pager}>
        <Pressable
          onPress={() => void a.goToPage(a.page - 1)}
          disabled={!canBack}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Previous page"
          style={[styles.pageBtn, { opacity: canBack ? 1 : 0.3 }]}
        >
          <CaretLeft size={18} color={tokens.accent} weight="bold" />
          <Text style={[styles.pageBtnText, { color: tokens.accent }]}>Previous</Text>
        </Pressable>
        {a.paging ? (
          <ActivityIndicator color={tokens.accent} />
        ) : (
          <Text style={[styles.pageLabel, { color: tokens.textSecondary }]}>
            Page {a.page} of {a.pageCount}
          </Text>
        )}
        <Pressable
          onPress={() => void a.goToPage(a.page + 1)}
          disabled={!canNext}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Next page"
          style={[styles.pageBtn, { opacity: canNext ? 1 : 0.3 }]}
        >
          <Text style={[styles.pageBtnText, { color: tokens.accent }]}>Next</Text>
          <CaretRight size={18} color={tokens.accent} weight="bold" />
        </Pressable>
      </View>
    ) : null;

  return (
    <FlatList
      ref={list}
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={styles.content}
      data={a.loading || a.error ? [] : a.rows}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: tokens.border }]} />}
      renderItem={({ item }) => (
        <AttendeeRow
          row={item}
          onPress={() => router.push(`/manage/event/${eventId}/attendee/${item.id}`)}
        />
      )}
      ListFooterComponent={pager}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={a.refreshing}
          onRefresh={a.refresh}
          tintColor={tokens.accent}
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    height: 50,
    paddingHorizontal: spacing[4],
    borderRadius: borderRadius.full,
  },
  searchInput: { flex: 1, height: '100%', fontSize: typography.fontSize.base, ...font() },
  count: { marginTop: spacing[4], marginBottom: spacing[1], fontSize: typography.fontSize.xs, ...font('medium') },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  empty: { marginTop: spacing[10], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing[6], minHeight: 44 },
  pageBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], paddingVertical: spacing[2] },
  pageBtnText: { fontSize: typography.fontSize.sm, ...font('semibold') },
  pageLabel: { fontSize: typography.fontSize.sm, ...font('medium') },
});
