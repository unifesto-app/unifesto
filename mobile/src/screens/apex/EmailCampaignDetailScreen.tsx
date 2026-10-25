import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { RefreshControl } from '../../components/ui/RefreshControl';
import useTopSpacing from '../../hooks/useTopSpacing';
import ManageStats from '../../components/manage/ManageStats';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { ApexRow, longDate, shortDate } from '../../components/apex/ApexRow';
import { campaignStatus } from '../../components/apex/campaignStatus';
import HtmlPreviewSheet from '../../components/apex/HtmlPreviewSheet';
import { AppAlert } from '../../components/ui/AppAlert';
import { cancelEmailCampaign, getEmailCampaign, previewEmailBody, type EmailCampaignDetail } from '../../lib/api/apexComms';
import { EMAIL_TARGET_LABEL, pct } from './EmailCampaignsScreen';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosFont, useCosmos } from '../../theme/cosmos';

const GUTTER = spacing[6];

/** One email campaign: delivery + engagement, A/B split, recipient log, cancel if scheduled. */
export default function EmailCampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCosmos();
  const topSpacing = useTopSpacing();
  const [campaign, setCampaign] = useState<EmailCampaignDetail | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getEmailCampaign(id!);
    if (res.ok) {
      setCampaign(res.data);
      setError('');
    } else setError(res.denied ? 'Only Unifesto platform admins can see this.' : res.message);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openPreview = async () => {
    if (!campaign) return;
    const res = await previewEmailBody(campaign.body);
    if (res.ok) setPreview(res.data.html);
    else AppAlert.alert('No preview', res.message);
  };

  const cancel = () =>
    AppAlert.alert('Cancel this campaign?', 'It will not be sent.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel campaign',
        style: 'destructive',
        onPress: async () => {
          const res = await cancelEmailCampaign(id!);
          if (!res.ok) AppAlert.alert('Not cancelled', res.message);
          void load();
        },
      },
    ]);

  if (!campaign) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Stack.Screen options={{ title: 'Campaign' }} />
        {error ? <Text style={[styles.muted, { color: c.muted }]}>{error}</Text> : <ActivityIndicator color={c.primary} />}
      </View>
    );
  }

  const s = campaignStatus(campaign.status, c);
  const when = campaign.sentAt ? `Sent ${longDate(campaign.sentAt)}` : campaign.scheduledAt ? `Scheduled for ${longDate(campaign.scheduledAt)}` : `Created ${longDate(campaign.createdAt)}`;

  return (
    <>
      <Stack.Screen options={{ title: 'Campaign' }} />
      <ScrollView
        style={{ backgroundColor: c.bg }}
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.primary} colors={[c.primary]} progressViewOffset={topSpacing} />
        }
      >
        <Text style={[styles.title, { color: c.text }]}>{campaign.subject}</Text>
        <Text style={[styles.muted, { color: c.muted }]}>
          <Text style={{ color: s.color }}>{s.label}</Text> · {EMAIL_TARGET_LABEL[campaign.targetType] ?? campaign.targetType} · {when}
        </Text>

        <View style={styles.stats}>
          <ManageStats
            stats={[
              { label: 'Sent', value: campaign.totalSent },
              { label: 'Failed', value: campaign.failedCount },
            ]}
          />
          <ManageStats
            stats={[
              { label: `Opens · ${pct(campaign.openCount, campaign.totalSent)}`, value: campaign.openCount },
              { label: `Clicks · ${pct(campaign.clickCount, campaign.totalSent)}`, value: campaign.clickCount },
            ]}
          />
        </View>

        <SettingsGroup plain>
          <SettingsRow label="Preview email" onPress={() => void openPreview()} />
          {campaign.status === 'SCHEDULED' ? <SettingsRow label="Cancel campaign" danger onPress={cancel} /> : null}
        </SettingsGroup>

        {campaign.stats ? (
          <SettingsGroup title="A/B subject results" plain>
            {(['a', 'b'] as const).map((k) => {
              const v = campaign.stats![k];
              return (
                <View key={k} style={styles.variant}>
                  <Text style={[styles.variantHead, { color: c.text }]}>
                    Variant {k.toUpperCase()} · {v.sent} sent
                  </Text>
                  <Text style={[styles.muted, { color: c.muted }]} numberOfLines={2}>
                    {k === 'a' ? campaign.subject : campaign.subjectB}
                  </Text>
                  <Text style={[styles.variantRates, { color: c.soft }]}>
                    Open {pct(v.opens, v.sent)} · Click {pct(v.clicks, v.sent)}
                  </Text>
                </View>
              );
            })}
          </SettingsGroup>
        ) : null}

        <Text style={[styles.section, { color: c.muted }]}>Recipients ({campaign.logs.length} shown)</Text>
        {campaign.logs.length === 0 ? <Text style={[styles.muted, { color: c.muted }]}>Nobody yet.</Text> : null}
        {campaign.logs.map((l, i) => {
          const engaged = l.firstClickedAt ? `clicked ${shortDate(l.firstClickedAt)}` : l.openedAt ? `opened ${shortDate(l.openedAt)}` : 'not opened';
          const statusColor = l.status === 'SENT' ? c.success : l.status === 'BOUNCED' ? c.warn : c.danger;
          return (
            <View key={l.id}>
              {i > 0 ? <View style={[styles.sep, { backgroundColor: c.border }]} /> : null}
              <ApexRow
                title={l.recipientEmail}
                meta={[l.variant ? `Variant ${l.variant}` : null, l.status === 'SENT' ? engaged : l.errorMessage].filter(Boolean).join(' · ')}
                value={l.status === 'SENT' ? 'Sent' : l.status === 'BOUNCED' ? 'Bounced' : 'Failed'}
                valueColor={statusColor}
              />
            </View>
          );
        })}
      </ScrollView>
      <HtmlPreviewSheet html={preview} title={campaign.subject} onClose={() => setPreview(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  title: { fontSize: typography.fontSize['2xl'], ...cosmosFont.display },
  muted: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  stats: { marginTop: spacing[5], gap: spacing[3] },
  variant: { paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
  variantHead: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  variantRates: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  section: { marginTop: spacing[8], marginBottom: spacing[1], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  sep: { height: StyleSheet.hairlineWidth },
});
