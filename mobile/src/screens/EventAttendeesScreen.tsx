import React from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MagnifyingGlass, X } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import { CardBackdrop } from '../components/ui/CardSurface';
import { useEventAttendees } from '../hooks/useEventAttendees';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import AttendeeRow from '../components/manage/AttendeeRow';
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
          {a.total.toLocaleString('en-IN')} {a.total === 1 ? 'booking' : 'bookings'}
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

  return (
    <FlatList
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
      onEndReached={() => void a.loadMore()}
      onEndReachedThreshold={0.4}
      ListFooterComponent={a.loadingMore ? <ActivityIndicator color={tokens.accent} style={{ marginVertical: spacing[4] }} /> : null}
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
});
