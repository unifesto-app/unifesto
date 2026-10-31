import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { openApexWeb } from '../../lib/openOnWeb';
import { Cards, Plus } from '@unifesto/unicon/react-native';
import { CosmosList } from '../../components/ui/CosmosScreen';
import { CardBackdrop } from '../../components/ui/CardSurface';
import { GUTTER } from '../../components/home/Section';
import usePagedList from '../../hooks/usePagedList';
import { HeaderActions, HeaderIconButton } from '../../navigation/HeaderActions';
import ManageStats from '../../components/manage/ManageStats';
import { ApexRow, whenShort } from '../../components/apex/ApexRow';
import { campaignStatus } from '../../components/apex/campaignStatus';
import { listEmailCampaigns, type EmailTargetType } from '../../lib/api/apexComms';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cardSegment, cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

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

export const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '–');

/** Platform email campaigns with open / click rates; + composes, cards icon opens templates. */
export default function EmailCampaignsScreen() {
  const router = useRouter();
  const c = useCosmos();
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
  const data = loading || error ? [] : rows;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActions>
              <HeaderIconButton onPress={() => openApexWeb('/dashboard/email/templates')} label="Templates on the web">
                <Cards size={24} color={c.text} />
              </HeaderIconButton>
              <HeaderIconButton onPress={() => openApexWeb('/dashboard/email/new')} label="New campaign on the web">
                <Plus size={24} color={c.text} />
              </HeaderIconButton>
            </HeaderActions>
          ),
        }}
      />
      <CosmosList
        refreshing={refreshing}
        onRefresh={refresh}
        contentContainerStyle={styles.content}
        data={data}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={
          <View style={{ marginBottom: spacing[4], gap: spacing[3] }}>
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
            <Text style={[styles.hint, { color: c.muted }]}>Sent and rates cover the campaigns loaded below.</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
          ) : (
            <View style={styles.empty}>
              <CardBackdrop shape={styles.empty} />
              <Text style={[styles.emptyText, { color: c.soft }]}>{error || 'No campaigns yet. Tap + to compose one.'}</Text>
            </View>
          )
        }
        renderItem={({ item, index }) => {
          const s = campaignStatus(item.status, c);
          const rates = item.totalSent ? `${item.totalSent} sent · ${pct(item.openCount, item.totalSent)} opened` : null;
          return (
            <View style={cardSegment(c.raised, index, data.length)}>
              {index > 0 ? <View style={[styles.sep, { backgroundColor: c.border }]} /> : null}
              <ApexRow
                title={`${item.subject}${item.subjectB ? '  (A/B)' : ''}`}
                meta={[EMAIL_TARGET_LABEL[item.targetType] ?? item.targetType, rates, whenShort(item.sentAt ?? item.scheduledAt ?? item.createdAt, now)]
                  .filter(Boolean)
                  .join(' · ')}
                value={s.label}
                valueColor={s.color}
                onPress={() => router.push({ pathname: '/apex/email/[id]', params: { id: item.id } })}
              />
            </View>
          );
        }}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={c.text} style={{ marginVertical: spacing[4] }} /> : null}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  hint: { fontSize: typography.fontSize.xs, ...cosmosFont.body },
  sep: { height: StyleSheet.hairlineWidth },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
