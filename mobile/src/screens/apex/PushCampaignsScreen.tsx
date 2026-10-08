import React, { useCallback } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Plus } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../../components/ui/RefreshControl';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import usePagedList from '../../hooks/usePagedList';
import { HeaderActions, HeaderIconButton } from '../../navigation/HeaderActions';
import ManageStats from '../../components/manage/ManageStats';
import { ApexRow, whenShort } from '../../components/apex/ApexRow';
import { AppAlert } from '../../components/ui/AppAlert';
import { campaignStatus } from '../../components/apex/campaignStatus';
import {
  cancelPushCampaign,
  deletePushCampaign,
  listPushCampaigns,
  sendPushCampaign,
  type PushCampaign,
  type PushCampaignStatus,
} from '../../lib/api/apexComms';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];
const PAGE_SIZE = 20;
const ACTIONABLE: PushCampaignStatus[] = ['DRAFT', 'SCHEDULED'];

export function pushTargetLabel(c: PushCampaign): string {
  const t = c.targetSegment;
  if (c.scope === 'EVENT') return 'Event announcement';
  if (!t || t.type === 'all') return 'All users';
  if (t.type === 'event') return 'Event attendees';
  if (t.type === 'space') return 'Space members';
  const n = t.userIds?.length ?? 0;
  return `${n} ${n === 1 ? 'person' : 'people'}`;
}

/** Push broadcasts: history with delivery counts, send-now / cancel for pending ones, delete for any not mid-send. */
export default function PushCampaignsScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  useAnalyticsScreenTracking('ApexPushCampaigns');

  const fetchPage = useCallback(async (page: number) => {
    const res = await listPushCampaigns(page, PAGE_SIZE);
    return res.ok ? { ok: true as const, data: { items: res.data.items, hasMore: page * PAGE_SIZE < res.data.total } } : res;
  }, []);
  const { rows, loading, loadingMore, refreshing, error, refresh, reload, loadMore } = usePagedList(fetchPage);

  const totals = rows.reduce(
    (acc, c) => ({ sent: acc.sent + c.sentCount, failed: acc.failed + c.failedCount, scheduled: acc.scheduled + (c.status === 'SCHEDULED' ? 1 : 0) }),
    { sent: 0, failed: 0, scheduled: 0 },
  );

  const act = async (fn: () => Promise<{ ok: boolean; message?: string }>, failTitle: string) => {
    const res = await fn();
    if (!res.ok) AppAlert.alert(failTitle, (res as { message: string }).message);
    void reload();
  };

  const confirmDelete = (c: PushCampaign) =>
    AppAlert.alert(
      'Delete this broadcast?',
      c.status === 'SENT' || c.status === 'FAILED'
        ? 'It leaves the history with its delivery counts. People who already got it keep the notification.'
        : 'It leaves the history and is never sent.',
      [
        { text: 'Keep', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => void act(() => deletePushCampaign(c.id), 'Not deleted') },
      ],
    );

  const openActions = (c: PushCampaign) =>
    AppAlert.alert(c.title, c.body, [
      ...(ACTIONABLE.includes(c.status)
        ? [
            { text: 'Send now', onPress: () => void act(() => sendPushCampaign(c.id), 'Not sent') },
            { text: 'Cancel broadcast', style: 'destructive' as const, onPress: () => void act(() => cancelPushCampaign(c.id), 'Not cancelled') },
          ]
        : []),
      { text: 'Delete', style: 'destructive', onPress: () => confirmDelete(c) },
      { text: 'Close', style: 'cancel' },
    ]);

  const now = new Date();

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActions>
              <HeaderIconButton onPress={() => router.push('/apex/push/new')} label="New push">
                <Plus size={24} color={tokens.text} />
              </HeaderIconButton>
            </HeaderActions>
          ),
        }}
      />
      <FlatList
        style={{ backgroundColor: tokens.bg }}
        contentContainerStyle={styles.content}
        data={loading || error ? [] : rows}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={
          <View style={{ paddingTop: topSpacing, marginBottom: spacing[2] }}>
            <ManageStats
              loading={loading}
              stats={[
                { label: 'Delivered', value: totals.sent },
                { label: 'Failed', value: totals.failed },
                { label: 'Scheduled', value: totals.scheduled },
              ]}
            />
            <Text style={[styles.hint, { color: tokens.textMuted }]}>Totals cover the broadcasts loaded below.</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[10] }} />
          ) : (
            <Text style={[styles.empty, { color: tokens.textMuted }]}>{error || 'No broadcasts yet. Tap + to send one.'}</Text>
          )
        }
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: tokens.border }]} />}
        renderItem={({ item }) => {
          const s = campaignStatus(item.status, tokens);
          const delivery = item.status === 'SENT' ? `${item.sentCount} sent${item.failedCount ? ` · ${item.failedCount} failed` : ''}` : null;
          const when = item.status === 'SCHEDULED' ? `for ${whenShort(item.scheduledAt, now)}` : whenShort(item.sentAt ?? item.createdAt, now);
          return (
            <ApexRow
              title={item.title}
              meta={[pushTargetLabel(item), delivery, when].filter(Boolean).join(' · ')}
              value={s.label}
              valueColor={s.color}
              // Everything but a broadcast mid-send can be acted on (at least deleted).
              onPress={item.status !== 'SENDING' ? () => openActions(item) : undefined}
            />
          );
        }}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={tokens.accent} style={{ marginVertical: spacing[4] }} /> : null}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  hint: { marginTop: spacing[2], fontSize: typography.fontSize.xs, ...font() },
  sep: { height: StyleSheet.hairlineWidth },
  empty: { marginTop: spacing[10], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
});
