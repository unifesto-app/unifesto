import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Cards, Plus } from '@unifesto/unicon/react-native';
import { RefreshControl } from '../../components/ui/RefreshControl';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import usePagedList from '../../hooks/usePagedList';
import { HeaderActions, HeaderIconButton } from '../../navigation/HeaderActions';
import ManageStats from '../../components/manage/ManageStats';
import { ApexRow, whenShort } from '../../components/apex/ApexRow';
import { campaignStatus } from '../../components/apex/campaignStatus';
import { listEmailCampaigns, type EmailTargetType } from '../../lib/api/apexComms';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];
const PAGE_SIZE = 20;

export const EMAIL_TARGET_LABEL: Record<EmailTargetType, string> = {
  ALL_USERS: 'All users',
  ORGANISERS_ONLY: 'Organisers',
  SEGMENT: 'Segment',
  SPACE_MEMBERS: 'Space members',
  EVENT_REGISTRANTS: 'Event registrants',
  WAITLIST: 'Waitlist',
  SINGLE_USER: 'One person',
};

export const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');

/** Platform email campaigns with open / click rates; + composes, cards icon opens templates. */
export default function EmailCampaignsScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [total, setTotal] = useState(0);

  const fetchPage = useCallback(async (page: number) => {
    const res = await listEmailCampaigns(page, PAGE_SIZE);
    if (!res.ok) return res;
    setTotal(res.data.meta.total);
    return { ok: true as const, data: { items: res.data.data, hasMore: page < res.data.meta.totalPages } };
  }, []);
  const { rows, loading, loadingMore, refreshing, error, refresh, loadMore } = usePagedList(fetchPage);

  const sent = rows.reduce((s, c) => s + c.totalSent, 0);
  const opens = rows.reduce((s, c) => s + c.openCount, 0);
  const clicks = rows.reduce((s, c) => s + c.clickCount, 0);
  const now = new Date();

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActions>
              <HeaderIconButton onPress={() => router.push('/apex/email/templates')} label="Templates">
                <Cards size={24} color={tokens.text} />
              </HeaderIconButton>
              <HeaderIconButton onPress={() => router.push('/apex/email/new')} label="New campaign">
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
          <View style={{ paddingTop: topSpacing, marginBottom: spacing[2], gap: spacing[3] }}>
            <ManageStats
              loading={loading}
              stats={[
                { label: 'Campaigns', value: total },
                { label: 'Emails sent', value: sent },
              ]}
            />
            <ManageStats
              loading={loading}
              stats={[
                { label: 'Open rate', value: pct(opens, sent) },
                { label: 'Click rate', value: pct(clicks, sent) },
              ]}
            />
            <Text style={[styles.hint, { color: tokens.textMuted }]}>Sent and rates cover the campaigns loaded below.</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={tokens.accent} style={{ marginTop: spacing[10] }} />
          ) : (
            <Text style={[styles.empty, { color: tokens.textMuted }]}>{error || 'No campaigns yet. Tap + to compose one.'}</Text>
          )
        }
        ItemSeparatorComponent={() => <View style={[styles.sep, { backgroundColor: tokens.border }]} />}
        renderItem={({ item }) => {
          const s = campaignStatus(item.status, tokens);
          const rates = item.totalSent ? `${item.totalSent} sent · ${pct(item.openCount, item.totalSent)} opened` : null;
          return (
            <ApexRow
              title={`${item.subject}${item.subjectB ? '  (A/B)' : ''}`}
              meta={[EMAIL_TARGET_LABEL[item.targetType] ?? item.targetType, rates, whenShort(item.sentAt ?? item.scheduledAt ?? item.createdAt, now)]
                .filter(Boolean)
                .join(' · ')}
              value={s.label}
              valueColor={s.color}
              onPress={() => router.push({ pathname: '/apex/email/[id]', params: { id: item.id } })}
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
  hint: { fontSize: typography.fontSize.xs, ...font() },
  sep: { height: StyleSheet.hairlineWidth },
  empty: { marginTop: spacing[10], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
});
