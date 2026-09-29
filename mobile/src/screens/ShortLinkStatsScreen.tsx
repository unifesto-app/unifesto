import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { conversion, getShortLinkStats, scopeFromParams, type ShortLinkStats } from '../lib/api/traffic';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { TrafficSummary, fmt } from '../components/traffic/TrafficSummary';
import { AppAlert } from '../components/ui/AppAlert';
import { shortLinkLabel } from './ShortLinksScreen';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const DEVICE_LABEL: Record<string, string> = { ios: 'iPhone / iPad', android: 'Android', desktop: 'Computer' };

/** One short link: clicks over the last 30 days, where they came from, what they turned into. */
export default function ShortLinkStatsScreen() {
  const params = useLocalSearchParams<{ scope: string; scopeId?: string; linkId: string }>();
  const scope = useMemo(() => scopeFromParams(params), [params.scope, params.scopeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<ShortLinkStats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking('ShortLinkStats');

  const load = useCallback(async () => {
    if (!scope || !params.linkId) return;
    const res = await getShortLinkStats(scope, params.linkId);
    if (res.ok) {
      setData(res.data);
      setError('');
    } else setError(res.message);
  }, [scope, params.linkId]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const copy = async (text: string) => {
    try {
      await Clipboard.setStringAsync(text);
      AppAlert.alert('Copied', text);
    } catch {
      AppAlert.alert('Unable to copy', 'Please try again.');
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
          tintColor={tokens.accent}
        />
      }
    >
      {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}
      {data ? (
        <>
          <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>{shortLinkLabel(data)}</Text>
          <TrafficSummary
            stats={[
              { label: 'Clicks', value: fmt(data.clicks) },
              { label: 'Visitors', value: fmt(data.visitors) },
              { label: 'Registrations', value: fmt(data.registrations) },
              { label: 'Registered per visitor', value: conversion(data.registrations, data.visitors) },
            ]}
            daily={data.daily.map((d) => d.clicks)}
            caption={`Clicks per day, last ${data.days} days`}
          />

          <View style={{ marginTop: spacing[8] }}>
            <SettingsGroup title="Link">
              <SettingsRow label="Short link" value={data.shortUrl.replace(/^https:\/\//, '')} onPress={() => void copy(data.shortUrl)} />
              <SettingsRow label="Source" value={data.source} />
              <SettingsRow label="Opens" value={data.url.replace(/^https:\/\//, '').split('?')[0]} onPress={() => void copy(data.url)} />
            </SettingsGroup>
          </View>

          <View style={{ marginTop: spacing[8] }}>
            <SettingsGroup title="Where clicks came from" plain>
              {data.referrers.length === 0 ? (
                <SettingsRow label="No clicks yet" />
              ) : (
                data.referrers.map((r) => (
                  <SettingsRow key={r.domain ?? 'direct'} label={r.domain ?? 'Direct or app'} value={fmt(r.clicks)} />
                ))
              )}
            </SettingsGroup>
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              Direct or app means the click had no website behind it: typed, scanned, or opened from an app like WhatsApp.
            </Text>
          </View>

          {data.devices.length > 0 ? (
            <View style={{ marginTop: spacing[8] }}>
              <SettingsGroup title="Devices" plain>
                {data.devices.map((d) => (
                  <SettingsRow key={d.device} label={DEVICE_LABEL[d.device] ?? d.device} value={fmt(d.clicks)} />
                ))}
              </SettingsGroup>
            </View>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  title: { fontSize: typography.fontSize.xl, marginBottom: spacing[2], ...font('heading') },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  error: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
});
