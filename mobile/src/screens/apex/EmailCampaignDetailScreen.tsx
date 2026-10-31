import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import CosmosScreen from '../../components/ui/CosmosScreen';
import { CardBackdrop } from '../../components/ui/CardSurface';
import { Button } from '../../components/ui';
import { GUTTER } from '../../components/home/Section';
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
import { cosmosCardRadius, cosmosFont, displayTracking, useCosmos } from '../../theme/cosmos';

/** One email campaign: delivery + engagement, A/B split, recipient log, cancel if scheduled. */
export default function EmailCampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useCosmos();
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
      <CosmosScreen contentContainerStyle={styles.pad}>
        <Stack.Screen options={{ title: 'Campaign' }} />
        {error ? (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.emptyText, { color: c.soft }]}>{error}</Text>
            <Button variant="secondary" label="Try again" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  const s = campaignStatus(campaign.status, c);
  const when = campaign.sentAt ? `Sent ${longDate(campaign.sentAt)}` : campaign.scheduledAt ? `Scheduled for ${longDate(campaign.scheduledAt)}` : `Created ${longDate(campaign.createdAt)}`;

  return (
    <>
      <Stack.Screen options={{ title: 'Campaign' }} />
      <CosmosScreen refreshing={refreshing} onRefresh={refresh} contentContainerStyle={styles.pad}>
        <Text style={[styles.title, { color: c.text }]} accessibilityRole="header">{campaign.subject}</Text>
        <View style={styles.metaRow}>
          <View style={[styles.dot, { backgroundColor: s.color }]} />
          <Text style={[styles.meta, { color: c.muted }]}>
            <Text style={[cosmosFont.strong, { color: s.color }]}>{s.label}</Text> · {EMAIL_TARGET_LABEL[campaign.targetType] ?? campaign.targetType} · {when}
          </Text>
        </View>

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
        {campaign.logs.length === 0 ? (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.emptyText, { color: c.soft }]}>Nobody yet.</Text>
          </View>
        ) : null}
        {campaign.logs.length > 0 ? (
          <View style={styles.list}>
          <CardBackdrop shape={styles.list} />
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
          </View>
        ) : null}
      </CosmosScreen>
      <HtmlPreviewSheet html={preview} title={campaign.subject} onClose={() => setPreview(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  list: { borderRadius: cosmosCardRadius, paddingHorizontal: spacing[4] },
  title: { fontSize: 26, lineHeight: 32, ...cosmosFont.display, letterSpacing: displayTracking(26) },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginTop: spacing[2] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  meta: { flexShrink: 1, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  muted: { marginTop: 4, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  stats: { marginTop: spacing[5], gap: spacing[3] },
  variant: { paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
  variantHead: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  variantRates: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  section: { marginTop: spacing[8], marginBottom: spacing[3], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  sep: { height: StyleSheet.hairlineWidth },
});
