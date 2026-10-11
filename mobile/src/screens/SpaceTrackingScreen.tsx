import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CaretDown, CaretRight, Link as LinkIcon, Scissors } from '@unifesto/unicon/react-native';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getSpaceRegistrationSources, sourceLabel, type SpaceRegistrationSource } from '../lib/api/tracking';
import { conversion, getTraffic, scopeParams, type SpaceTrafficStats } from '../lib/api/traffic';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { TrafficSummary, fmt } from '../components/traffic/TrafficSummary';
import CosmosScreen from '../components/ui/CosmosScreen';
import Skeleton from '../components/Skeleton';
import { GUTTER, Section } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 26;

const keyOf = (s: SpaceRegistrationSource) => `${s.source}|${s.medium}|${s.campaign}`;

/**
 * Tracking across a whole space: which sources bring people in
 * over all its events. Tap a source to see its per-event split, then an event
 * to see who registered through it. Also builds tracking links to the space page.
 */
export default function SpaceTrackingScreen() {
  const { spaceId, slug, name } = useLocalSearchParams<{ spaceId: string; slug?: string; name?: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [data, setData] = useState<{ total: number; tagged: number; sources: SpaceRegistrationSource[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [traffic, setTraffic] = useState<SpaceTrafficStats | null>(null);

  useAnalyticsScreenTracking('SpaceTracking');

  const load = useCallback(async () => {
    if (!spaceId) return;
    const [res, views] = await Promise.all([
      getSpaceRegistrationSources(spaceId),
      getTraffic<SpaceTrafficStats>({ kind: 'space', id: spaceId }),
    ]);
    if (views.ok) setTraffic(views.data);
    if (res.ok) {
      setData(res.data);
      setError('');
    } else setError(res.denied ? 'You need access to this space to see its tracking.' : res.message);
  }, [spaceId]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <CosmosScreen>
        <View style={styles.pad}>
          <Skeleton width="100%" height={240} borderRadius={cosmosCardRadius} />
          <Skeleton width="100%" height={160} borderRadius={cosmosCardRadius} style={{ marginTop: spacing[10] }} />
        </View>
      </CosmosScreen>
    );
  }

  const total = data?.total ?? 0;
  const spaceUrl = slug ? `https://www.unifesto.app/space/${slug}` : '';
  const caret = (on: boolean) => (on ? <CaretDown size={16} color={c.muted} /> : <CaretRight size={16} color={c.muted} />);

  return (
    <CosmosScreen refreshing={refreshing} onRefresh={onRefresh}>
      {name ? (
        <Text style={[styles.title, { color: c.text }]} numberOfLines={2} accessibilityRole="header">
          {name}
        </Text>
      ) : null}
      {error ? (
        <View style={[styles.card, styles.padded, { backgroundColor: c.raised }]}>
          <Text style={[styles.muted, { color: c.danger }]}>{error}</Text>
        </View>
      ) : null}

      {traffic ? (
        <View style={styles.pad}>
          <TrafficSummary
            stats={[
              { label: 'Page views', value: fmt(traffic.views) },
              { label: 'Visitors', value: fmt(traffic.visitors) },
              { label: 'Registrations', value: fmt(traffic.registrations) },
              { label: 'Registered per visitor', value: conversion(traffic.registrations, traffic.visitors) },
            ]}
            daily={traffic.daily.map((d) => d.views)}
            caption={`Views of the space page and its events in the app, last ${traffic.days} days`}
          />
        </View>
      ) : null}

      {traffic && traffic.topEvents.length > 0 ? (
        <Section title="Most viewed">
          <SettingsGroup plain style={styles.group}>
            {traffic.spacePageViews > 0 ? <SettingsRow label="Space page" value={fmt(traffic.spacePageViews)} /> : null}
            {traffic.topEvents.map((e) => (
              <SettingsRow
                key={e.id}
                label={e.title ?? e.slug}
                value={fmt(e.views)}
                onPress={() => router.push({ pathname: `/manage/event/${e.id}/tracking`, params: { slug: e.slug, title: e.title ?? '' } })}
              />
            ))}
          </SettingsGroup>
        </Section>
      ) : null}

      {data ? (
        <Section title="Where registrations come from" subtitle="Tap a source for its split by event, then an event to see who registered">
          <View style={[styles.card, { padding: spacing[5], backgroundColor: c.raised }]}>
            <Text style={[styles.big, { color: c.text }]}>{total ? Math.round((data.tagged / total) * 100) : 0}%</Text>
            <Text style={[styles.muted, { color: c.soft }]}>
              of {total.toLocaleString('en-IN')} confirmed registrations came through a tracking link
            </Text>
          </View>

          <SettingsGroup plain style={[styles.group, { marginTop: spacing[3] }]}>
            {data.sources.length === 0 ? (
              <SettingsRow label="No confirmed registrations yet" />
            ) : (
              data.sources.flatMap((s) => {
                const k = keyOf(s);
                const isOpen = open === k;
                const head = (
                  <SettingsRow
                    key={k}
                    label={sourceLabel(s)}
                    value={`${s.registrations.toLocaleString('en-IN')} · ${Math.round((s.registrations / total) * 100)}%`}
                    trailing={caret(isOpen)}
                    onPress={() => setOpen(isOpen ? null : k)}
                  />
                );
                if (!isOpen) return [head];
                return [
                  head,
                  ...s.events.map((ev) => (
                    <View key={`${k}|${ev.id}`} style={{ backgroundColor: c.tint }}>
                      <SettingsRow
                        label={ev.title}
                        value={ev.registrations.toLocaleString('en-IN')}
                        onPress={() =>
                          router.push({
                            pathname: `/manage/event/${ev.id}/source`,
                            params: { source: s.source ?? '', medium: s.medium ?? '', campaign: s.campaign ?? '' },
                          })
                        }
                      />
                    </View>
                  )),
                ];
              })
            )}
          </SettingsGroup>
        </Section>
      ) : null}

      {spaceId ? (
        <Section title="Space page links">
          <SettingsGroup style={styles.group}>
            <SettingsRow
              icon={<Scissors size={ICON} color={c.text} weight="bold" />}
              label="Short links"
              onPress={() =>
                router.push({ pathname: '/short-links', params: { ...scopeParams({ kind: 'space', id: spaceId }), title: name ?? '' } })
              }
            />
            {spaceUrl ? (
              <SettingsRow
                icon={<LinkIcon size={ICON} color={c.text} weight="bold" />}
                label="Build a tracking link"
                onPress={() => router.push({ pathname: '/utm-link', params: { url: spaceUrl, title: name ?? '', campaign: slug } })}
              />
            ) : null}
          </SettingsGroup>
          <Text style={[styles.note, { color: c.muted }]}>
            A registration for any of this space's events counts for a space link opened within 7 days before it. Short links also list
            every link made for this space's events.
          </Text>
        </Section>
      ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  title: { paddingHorizontal: GUTTER, fontSize: 18, lineHeight: 26, ...cosmosFont.display },
  card: { marginHorizontal: GUTTER, borderRadius: cosmosCardRadius },
  padded: { marginTop: spacing[4], padding: spacing[5] },
  // Section owns the top spacing and the title; the card just needs the gutter.
  group: { marginTop: 0, marginHorizontal: GUTTER },
  big: { fontSize: 36, lineHeight: 46, ...cosmosFont.display },
  muted: { marginTop: 2, fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  note: {
    marginTop: spacing[3],
    marginHorizontal: GUTTER + spacing[1],
    fontSize: typography.fontSize.sm,
    lineHeight: typography.fontSize.sm * 1.45,
    ...cosmosFont.body,
  },
});
