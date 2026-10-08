import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CaretDown, CaretRight, Link as LinkIcon, Scissors } from '@unifesto/unicon/react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getSpaceRegistrationSources, sourceLabel, type SpaceRegistrationSource } from '../lib/api/tracking';
import { conversion, getTraffic, scopeParams, type SpaceTrafficStats } from '../lib/api/traffic';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { TrafficSummary, fmt } from '../components/traffic/TrafficSummary';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';
import { CardBackdrop } from '../components/ui/CardSurface';

const GUTTER = spacing[6];
const ICON = 28;

const keyOf = (s: SpaceRegistrationSource) => `${s.source}|${s.medium}|${s.campaign}`;

/**
 * Tracking across a whole space: which sources bring people in
 * over all its events. Tap a source to see its per-event split, then an event
 * to see who registered through it. Also builds tracking links to the space page.
 */
export default function SpaceTrackingScreen() {
  const { spaceId, slug, name } = useLocalSearchParams<{ spaceId: string; slug?: string; name?: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
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

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const total = data?.total ?? 0;
  const spaceUrl = slug ? `https://www.unifesto.app/space/${slug}` : '';
  const caret = (on: boolean) =>
    on ? <CaretDown size={18} color={tokens.textMuted} /> : <CaretRight size={18} color={tokens.textMuted} />;

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
      {name ? <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>{name}</Text> : null}
      {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}

      {traffic ? (
        <>
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
          {traffic.topEvents.length > 0 ? (
            <View style={{ marginTop: spacing[8] }}>
              <SettingsGroup title="Most viewed" plain>
                {traffic.spacePageViews > 0 ? (
                  <SettingsRow label="Space page" value={fmt(traffic.spacePageViews)} />
                ) : null}
                {traffic.topEvents.map((e) => (
                  <SettingsRow
                    key={e.id}
                    label={e.title ?? e.slug}
                    value={fmt(e.views)}
                    onPress={() => router.push({ pathname: `/manage/event/${e.id}/tracking`, params: { slug: e.slug, title: e.title ?? '' } })}
                  />
                ))}
              </SettingsGroup>
            </View>
          ) : null}
        </>
      ) : null}

      {data ? (
        <>
          <View style={styles.hero}>
            <CardBackdrop shape={styles.hero} />
            <Text style={[styles.big, { color: tokens.text }]}>
              {total ? Math.round((data.tagged / total) * 100) : 0}%
            </Text>
            <Text style={[styles.muted, { color: tokens.textMuted }]}>
              of {total.toLocaleString('en-IN')} confirmed registrations came through a tracking link
            </Text>
          </View>

          <View style={{ marginTop: spacing[8] }}>
            <SettingsGroup title="By source" plain>
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
                      <SettingsRow
                        key={`${k}|${ev.id}`}
                        label={ev.title}
                        value={ev.registrations.toLocaleString('en-IN')}
                        onPress={() =>
                          router.push({
                            pathname: `/manage/event/${ev.id}/source`,
                            params: { source: s.source ?? '', medium: s.medium ?? '', campaign: s.campaign ?? '' },
                          })
                        }
                      />
                    )),
                  ];
                })
              )}
            </SettingsGroup>
            <Text style={[styles.note, { color: tokens.textMuted }]}>
              Tap a source for its split by event, then an event to see who registered.
            </Text>
          </View>
        </>
      ) : null}

      {spaceId ? (
        <View style={{ marginTop: spacing[8] }}>
          <SettingsGroup title="Space page links">
            <SettingsRow
              icon={<Scissors size={ICON} color={tokens.accent} weight="bold" />}
              label="Short links"
              onPress={() =>
                router.push({ pathname: '/short-links', params: { ...scopeParams({ kind: 'space', id: spaceId }), title: name ?? '' } })
              }
            />
            {spaceUrl ? (
              <SettingsRow
                icon={<LinkIcon size={ICON} color={tokens.accent} weight="bold" />}
                label="Build a tracking link"
                onPress={() => router.push({ pathname: '/utm-link', params: { url: spaceUrl, title: name ?? '', campaign: slug } })}
              />
            ) : null}
          </SettingsGroup>
          <Text style={[styles.note, { color: tokens.textMuted }]}>
            A registration for any of this space's events counts for a space link opened within 7 days before it. Short links also list every link made for this space's events.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  title: { fontSize: typography.fontSize.xl, marginBottom: spacing[2], ...font('heading') },
  hero: { marginTop: spacing[4], padding: spacing[5], borderRadius: borderRadius.xl },
  big: { fontSize: 44, lineHeight: 52, ...font('heading') },
  muted: { marginTop: 2, fontSize: typography.fontSize.sm, ...font() },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  error: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
});
