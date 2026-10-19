import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../../components/ui/RefreshControl';
import { useRouter } from 'expo-router';
import { Scissors } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import { conversion, getTraffic, scopeParams, type PlatformTrafficStats } from '../../lib/api/traffic';
import { sourceLabel } from '../../lib/api/tracking';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { TrafficSummary, fmt } from '../../components/traffic/TrafficSummary';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 28;
const PLATFORM_LABEL: Record<string, string> = { ios: 'iOS', android: 'Android', web: 'Web' };

/** Apex › Traffic: page views across the platform, what's most viewed, and platform short links. */
export default function TrafficScreen() {
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [data, setData] = useState<PlatformTrafficStats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await getTraffic<PlatformTrafficStats>({ kind: 'admin' });
    if (res.ok) {
      setData(res.data);
      setError('');
    } else setError(res.message);
  }, []);

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

      <SettingsGroup title="Links">
        <SettingsRow
          icon={<Scissors size={ICON} color={tokens.accent} weight="bold" />}
          label="Short links"
          onPress={() => router.push({ pathname: '/short-links', params: { ...scopeParams({ kind: 'admin' }), title: '' } })}
        />
      </SettingsGroup>

      {data ? (
        <>
          <TrafficSummary
            stats={[
              { label: 'Page views', value: fmt(data.views) },
              { label: 'Visitors', value: fmt(data.visitors) },
              { label: 'Registrations', value: fmt(data.registrations) },
              { label: 'Registered per visitor', value: conversion(data.registrations, data.visitors) },
            ]}
            daily={data.daily.map((d) => d.views)}
            caption={`Event and space page views in the app, last ${data.days} days`}
          />

          <Section title="Top events" empty="No views yet">
            {data.topEvents.map((e) => (
              <SettingsRow key={e.id} label={e.title ?? e.slug} value={fmt(e.views)} />
            ))}
          </Section>

          <Section title="Top spaces" empty="No views yet">
            {data.topSpaces.map((s) => (
              <SettingsRow key={s.id} label={s.name ?? s.slug} value={fmt(s.views)} />
            ))}
          </Section>

          <Section title="Sources" empty="No views yet">
            {data.sources.map((s) => (
              <SettingsRow key={`${s.source}|${s.medium}`} label={sourceLabel(s)} value={fmt(s.views)} />
            ))}
          </Section>

          <Section title="Platforms" empty="No views yet">
            {data.platforms.map((p) => (
              <SettingsRow key={p.platform} label={PLATFORM_LABEL[p.platform] ?? p.platform} value={fmt(p.views)} />
            ))}
          </Section>
        </>
      ) : null}
    </ScrollView>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <View style={{ marginTop: spacing[8] }}>
      <SettingsGroup title={title} plain>
        {children.length === 0 ? <SettingsRow label={empty} /> : children}
      </SettingsGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  error: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
});
