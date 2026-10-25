import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import CosmosScreen from '../../components/ui/CosmosScreen';
import { Button } from '../../components/ui';
import { GUTTER } from '../../components/home/Section';
import { useRouter } from 'expo-router';
import { Scissors } from '@unifesto/unicon/react-native';
import { conversion, getTraffic, scopeParams, type PlatformTrafficStats } from '../../lib/api/traffic';
import { sourceLabel } from '../../lib/api/tracking';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { TrafficSummary, fmt } from '../../components/traffic/TrafficSummary';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../../theme/cosmos';

const ICON = 28;
const PLATFORM_LABEL: Record<string, string> = { ios: 'iOS', android: 'Android', web: 'Web' };

/** Apex › Traffic: page views across the platform, what's most viewed, and platform short links. */
export default function TrafficScreen() {
  const router = useRouter();
  const c = useCosmos();
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
      <CosmosScreen>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  return (
    <CosmosScreen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
      contentContainerStyle={styles.content}
    >
      {error ? (
        <View style={[styles.empty, { backgroundColor: c.raised }]}>
          <Text style={[styles.error, { color: c.soft }]}>{error}</Text>
          <Button variant="secondary" label="Try again" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
        </View>
      ) : null}

      <SettingsGroup title="Links">
        <SettingsRow
          icon={<Scissors size={ICON} color={c.text} weight="bold" />}
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
    </CosmosScreen>
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
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  error: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
});
