import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { conversion, getShortLinkStats, scopeFromParams, type ShortLinkStats } from '../lib/api/traffic';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { TrafficSummary, fmt } from '../components/traffic/TrafficSummary';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { shortLinkLabel } from './ShortLinksScreen';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';

const DEVICE_LABEL: Record<string, string> = { ios: 'iPhone / iPad', android: 'Android', desktop: 'Computer' };

/** "IN" → "India" where the engine has Intl.DisplayNames, else the code; null → "Unknown". */
function countryLabel(code: string | null): string {
  if (!code) return 'Unknown';
  try {
    return new Intl.DisplayNames(['en-IN'], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** One short link: clicks over the last 30 days, where they came from, what they turned into. */
export default function ShortLinkStatsScreen() {
  const params = useLocalSearchParams<{ scope: string; scopeId?: string; linkId: string }>();
  const scope = useMemo(() => scopeFromParams(params), [params.scope, params.scopeId]); // eslint-disable-line react-hooks/exhaustive-deps
  const c = useCosmos();
  const [data, setData] = useState<ShortLinkStats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      <CosmosScreen contentContainerStyle={styles.content}>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
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
    <CosmosScreen
      contentContainerStyle={styles.content}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}
      {data ? (
        <>
          <Text style={[styles.title, { color: c.text }]} numberOfLines={2} accessibilityRole="header">
            {shortLinkLabel(data)}
          </Text>
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
            <Text style={[styles.note, { color: c.muted }]}>
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

          {data.countries.length > 0 ? (
            <View style={{ marginTop: spacing[8] }}>
              <SettingsGroup title="Countries" plain>
                {data.countries.map((c) => (
                  <SettingsRow key={c.country ?? 'unknown'} label={countryLabel(c.country)} value={fmt(c.clicks)} />
                ))}
              </SettingsGroup>
            </View>
          ) : null}

          <View style={{ marginTop: spacing[8] }}>
            <SettingsGroup title="QR code">
              <View style={styles.qr}>
                {/* Black on white whatever the theme, so it always scans. */}
                <View style={styles.qrTile}>
                  <QRCode value={data.shortUrl} size={160} color="#000000" backgroundColor="#ffffff" />
                </View>
              </View>
              <SettingsRow label="Download PNG" onPress={() => void Linking.openURL(`${data.qrUrl}?format=png`)} />
            </SettingsGroup>
            <Text style={[styles.note, { color: c.muted }]}>
              For posters, standees and slides. Scans count as clicks.
            </Text>
          </View>
        </>
      ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  title: { fontSize: typography.fontSize['2xl'], lineHeight: 30, marginBottom: spacing[2], ...cosmosFont.display, letterSpacing: displayTracking(24) },
  qr: { alignItems: 'center', padding: spacing[4] },
  // The pass rule (DESIGN §8): a plain white panel with its quiet zone, whatever the theme.
  qrTile: { padding: spacing[3], borderRadius: borderRadius.md, backgroundColor: '#ffffff' },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
  error: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
