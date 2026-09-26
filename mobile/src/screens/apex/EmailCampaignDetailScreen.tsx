import React, { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { RefreshControl } from '../../components/ui/RefreshControl';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
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
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];

/** One email campaign: delivery + engagement, A/B split, recipient log, cancel if scheduled. */
export default function EmailCampaignDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [c, setC] = useState<EmailCampaignDetail | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  useAnalyticsScreenTracking('ApexEmailCampaignDetail');

  const load = useCallback(async () => {
    const res = await getEmailCampaign(id!);
    if (res.ok) {
      setC(res.data);
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
    if (!c) return;
    const res = await previewEmailBody(c.body);
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

  if (!c) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <Stack.Screen options={{ title: 'Campaign' }} />
        {error ? <Text style={[styles.muted, { color: tokens.textMuted }]}>{error}</Text> : <ActivityIndicator color={tokens.accent} />}
      </View>
    );
  }

  const s = campaignStatus(c.status, tokens);
  const when = c.sentAt ? `Sent ${longDate(c.sentAt)}` : c.scheduledAt ? `Scheduled for ${longDate(c.scheduledAt)}` : `Created ${longDate(c.createdAt)}`;

  return (
    <>
      <Stack.Screen options={{ title: 'Campaign' }} />
      <ScrollView
        style={{ backgroundColor: tokens.bg }}
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={tokens.accent} colors={[tokens.accent]} progressViewOffset={topSpacing} />
        }
      >
        <Text style={[styles.title, { color: tokens.text }]}>{c.subject}</Text>
        <Text style={[styles.muted, { color: tokens.textMuted }]}>
          <Text style={{ color: s.color }}>{s.label}</Text> · {EMAIL_TARGET_LABEL[c.targetType] ?? c.targetType} · {when}
        </Text>

        <View style={styles.stats}>
          <ManageStats
            stats={[
              { label: 'Sent', value: c.totalSent },
              { label: 'Failed', value: c.failedCount },
            ]}
          />
          <ManageStats
            stats={[
              { label: `Opens · ${pct(c.openCount, c.totalSent)}`, value: c.openCount },
              { label: `Clicks · ${pct(c.clickCount, c.totalSent)}`, value: c.clickCount },
            ]}
          />
        </View>

        <SettingsGroup plain>
          <SettingsRow label="Preview email" onPress={() => void openPreview()} />
          {c.status === 'SCHEDULED' ? <SettingsRow label="Cancel campaign" danger onPress={cancel} /> : null}
        </SettingsGroup>

        {c.stats ? (
          <SettingsGroup title="A/B subject results" plain>
            {(['a', 'b'] as const).map((k) => {
              const v = c.stats![k];
              return (
                <View key={k} style={styles.variant}>
                  <Text style={[styles.variantHead, { color: tokens.text }]}>
                    Variant {k.toUpperCase()} · {v.sent} sent
                  </Text>
                  <Text style={[styles.muted, { color: tokens.textMuted }]} numberOfLines={2}>
                    {k === 'a' ? c.subject : c.subjectB}
                  </Text>
                  <Text style={[styles.variantRates, { color: tokens.textSecondary }]}>
                    Open {pct(v.opens, v.sent)} · Click {pct(v.clicks, v.sent)}
                  </Text>
                </View>
              );
            })}
          </SettingsGroup>
        ) : null}

        <Text style={[styles.section, { color: tokens.textMuted }]}>Recipients ({c.logs.length} shown)</Text>
        {c.logs.length === 0 ? <Text style={[styles.muted, { color: tokens.textMuted }]}>Nobody yet.</Text> : null}
        {c.logs.map((l, i) => {
          const engaged = l.firstClickedAt ? `clicked ${shortDate(l.firstClickedAt)}` : l.openedAt ? `opened ${shortDate(l.openedAt)}` : 'not opened';
          const statusColor = l.status === 'SENT' ? tokens.success : l.status === 'BOUNCED' ? tokens.warning : tokens.danger;
          return (
            <View key={l.id}>
              {i > 0 ? <View style={[styles.sep, { backgroundColor: tokens.border }]} /> : null}
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
      <HtmlPreviewSheet html={preview} title={c.subject} onClose={() => setPreview(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  title: { fontSize: typography.fontSize['2xl'], letterSpacing: -0.4, ...font('heading') },
  muted: { marginTop: 4, fontSize: typography.fontSize.sm, ...font() },
  stats: { marginTop: spacing[5], gap: spacing[3] },
  variant: { paddingHorizontal: spacing[4], paddingVertical: spacing[4] },
  variantHead: { fontSize: typography.fontSize.base, ...font('semibold') },
  variantRates: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...font('medium') },
  section: { marginTop: spacing[8], marginBottom: spacing[1], marginLeft: spacing[1], fontSize: typography.fontSize.sm, ...font('semibold') },
  sep: { height: StyleSheet.hairlineWidth },
});
