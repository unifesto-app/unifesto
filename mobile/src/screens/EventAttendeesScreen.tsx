import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CaretLeft, CaretRight } from '@unifesto/unicon/react-native';
import CosmosBackdrop from '../components/ui/CosmosBackdrop';
import { CardBackdrop } from '../components/ui/CardSurface';
import SearchField from '../components/manage/SearchField';
import { GUTTER } from '../components/home/Section';
import { useEventAttendees } from '../hooks/useEventAttendees';
import useTopSpacing from '../hooks/useTopSpacing';
import AttendeeRow from '../components/manage/AttendeeRow';
import type { AttendeeRow as AttendeeRowData } from '../lib/api/manageEvent';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import type { AttendeeFilter } from '../lib/api/manageEvent';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cardSegment, cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const TABS: { key: AttendeeFilter; label: string }[] = [
  { key: 'attending', label: 'Attending' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'all', label: 'All' },
];

/** Searchable, paged attendee list for one event (operator view). */
export default function EventAttendeesScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const a = useEventAttendees(eventId);
  const list = useRef<FlatList<AttendeeRowData>>(null);

  // A new page starts at its top, not where the last one was scrolled to.
  useEffect(() => {
    list.current?.scrollToOffset({ offset: 0, animated: false });
  }, [a.page]);

  const header = (
    <View style={{ paddingTop: topSpacing }}>
      <SearchField value={a.query} onChangeText={a.setQuery} placeholder="Name, phone, email or username" />
      <View style={{ marginTop: spacing[4] }}>
        <SegmentedTabs tabs={TABS} value={a.filter} onChange={a.setFilter} />
      </View>
      {!a.loading && !a.error ? (
        <Text style={[styles.count, { color: c.muted }]}>
          {a.pageCount > 1
            ? `${a.from.toLocaleString('en-IN')}–${a.to.toLocaleString('en-IN')} of ${a.total.toLocaleString('en-IN')} bookings`
            : `${a.total.toLocaleString('en-IN')} ${a.total === 1 ? 'booking' : 'bookings'}`}
        </Text>
      ) : null}
    </View>
  );

  const empty = a.loading ? (
    <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
  ) : (
    <View style={styles.empty}>
      <CardBackdrop shape={styles.empty} />
      <Text style={[styles.emptyText, { color: c.soft }]}>
        {a.denied
          ? 'The attendee list is only open to Space admins right now.'
          : a.error || (a.query ? 'No one matches that search.' : 'No one here yet.')}
      </Text>
    </View>
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
          <CaretLeft size={18} color={c.primary} weight="bold" />
          <Text style={[styles.pageBtnText, { color: c.primary }]}>Previous</Text>
        </Pressable>
        {a.paging ? (
          <ActivityIndicator color={c.text} />
        ) : (
          <Text style={[styles.pageLabel, { color: c.soft }]}>
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
          <Text style={[styles.pageBtnText, { color: c.primary }]}>Next</Text>
          <CaretRight size={18} color={c.primary} weight="bold" />
        </Pressable>
      </View>
    ) : null;

  const data = a.loading || a.error ? [] : a.rows;

  // A View + backdrop rather than CosmosList: the pager needs the FlatList ref.
  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <FlatList
        ref={list}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={styles.content}
        data={data}
        keyExtractor={(r) => r.id}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        // One card for the page: each booking is a segment of it.
        renderItem={({ item, index }) => (
          <View style={cardSegment(c.raised, index, data.length)}>
            {index > 0 ? <View style={[styles.sep, { backgroundColor: c.border }]} /> : null}
            <AttendeeRow
              row={item}
              onPress={() => router.push(`/manage/event/${eventId}/attendee/${item.id}`)}
            />
          </View>
        )}
        ListFooterComponent={pager}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={a.refreshing}
            onRefresh={a.refresh}
            tintColor={c.text}
            colors={[c.text]}
            progressViewOffset={topSpacing}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  count: { marginTop: spacing[6], marginBottom: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  sep: { height: StyleSheet.hairlineWidth, marginLeft: 52 },
  empty: { marginTop: spacing[6], borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing[6], minHeight: 44 },
  pageBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing[1], paddingVertical: spacing[2] },
  pageBtnText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  pageLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
