import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../../components/ui/RefreshControl';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import useTopSpacing from '../../hooks/useTopSpacing';
import { fetchAllRequests, orderSections, sourceDef, type RequestSource, type RequestTab, type SourceResult } from '../../lib/apexRequests';
import SegmentedTabs from '../../components/ui/SegmentedTabs';
import { ApexRow } from '../../components/apex/ApexRow';
import { borderRadius, spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import CosmosBackdrop from '../../components/ui/CosmosBackdrop';
import { GUTTER } from '../../components/home/Section';
import { cardSegment, cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

const TABS: { key: RequestTab; label: string }[] = [
  { key: 'open', label: 'Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

const EMPTY: Record<RequestTab, string> = {
  open: 'Nothing waiting on me.',
  approved: 'Nothing approved yet.',
  rejected: 'Nothing rejected.',
};

type Filter = RequestSource | 'all';

/**
 * Every Apex decision on one screen: space, status, ownership, sub-space,
 * ticket-transfer and free-add requests, plus refunds and
 * payouts. "All" groups them by type; a chip narrows to one.
 */
export default function RequestsScreen() {
  const params = useLocalSearchParams<{ type?: string }>();
  const router = useRouter();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const [tab, setTab] = useState<RequestTab>('open');
  const [filter, setFilter] = useState<Filter>(params.type && sourceDef(params.type) ? (params.type as RequestSource) : 'all');
  const [results, setResults] = useState<SourceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const gen = ++generation.current;
    const next = await fetchAllRequests(tab);
    if (gen !== generation.current) return;
    setResults(next);
  }, [tab]);

  // Reload on tab change and whenever we come back from a review.
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load().finally(() => setLoading(false));
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const sections = useMemo(() => {
    const picked = filter === 'all' ? orderSections(results, tab) : results.filter((r) => r.def.source === filter);
    return picked
      .filter((r) => r.rows.length > 0 || (filter !== 'all' && r.error))
      .map((r) => ({ key: r.def.source, title: r.def.label, error: r.error, data: r.rows }));
  }, [results, filter, tab]);

  const total = results.reduce((sum, r) => sum + r.rows.length, 0);
  const failed = results.filter((r) => r.error);
  // Only "All" shows the partial-failure note; a single filter shows its own error inline.
  const failNote = filter === 'all' && failed.length > 0 ? `Couldn't load ${failed.map((r) => r.def.label.toLowerCase()).join(', ')}.` : '';

  const chips: { key: Filter; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: total },
    ...results.map((r) => ({ key: r.def.source, label: r.def.label, count: r.rows.length })),
  ];

  return (
    <View style={[styles.container, { backgroundColor: c.bg }]}>
      <CosmosBackdrop horizon={false} />
      <SectionList
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
        contentContainerStyle={styles.content}
        sections={loading ? [] : sections}
        keyExtractor={(r) => r.key}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={{ paddingTop: topSpacing }}>
            <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chips}>
              {chips.map((chip) => {
                const on = chip.key === filter;
                return (
                  <Pressable
                    key={chip.key}
                    onPress={() => setFilter(chip.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={({ pressed }) => [
                      styles.chip,
                      { backgroundColor: on ? c.primary : c.raised, transform: [{ scale: pressed ? 0.96 : 1 }] },
                    ]}
                  >
                    <Text style={[styles.chipLabel, { color: on ? c.primaryFg : c.text }]}>
                      {chip.label}
                      {!loading && chip.count > 0 ? <Text style={[cosmosFont.figure, { color: on ? c.primaryFg : c.muted }]}>{`  ${chip.count}`}</Text> : null}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            {failNote ? <Text style={[styles.fail, { color: c.danger }]}>{failNote}</Text> : null}
          </View>
        }
        renderSectionHeader={({ section }) =>
          filter === 'all' || section.error ? (
            <View style={styles.sectionHead}>
              {filter === 'all' ? (
                <Text style={[styles.sectionTitle, { color: c.muted }]}>
                  {section.title}  ·  {section.data.length}
                </Text>
              ) : null}
              {section.error ? <Text style={[styles.fail, { color: c.danger }]}>{section.error}</Text> : null}
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
          ) : (
            <View style={[styles.empty, { backgroundColor: c.raised }]}>
              <Text style={[styles.emptyText, { color: c.soft }]}>{EMPTY[tab]}</Text>
            </View>
          )
        }
        // Each section reads as one card.
        renderItem={({ item, index, section }) => (
          <View style={cardSegment(c.raised, index, section.data.length)}>
            {index > 0 ? <View style={[styles.sep, { backgroundColor: c.border }]} /> : null}
            <ApexRow title={item.title} meta={item.meta} value={item.value} onPress={() => router.push(item.open() as never)} />
          </View>
        )}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} colors={[c.text]} progressViewOffset={topSpacing} />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: GUTTER, paddingBottom: 120 },
  chipScroll: { marginTop: spacing[4], marginHorizontal: -GUTTER },
  chips: { gap: spacing[2], paddingHorizontal: GUTTER },
  chip: { paddingHorizontal: spacing[4], paddingVertical: spacing[2], borderRadius: borderRadius.full },
  chipLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  sectionHead: { marginTop: spacing[6], marginBottom: spacing[3] },
  sectionTitle: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  fail: { marginTop: spacing[3], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  sep: { height: StyleSheet.hairlineWidth },
  empty: { marginTop: spacing[6], borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
