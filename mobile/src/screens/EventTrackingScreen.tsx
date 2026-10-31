import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { EnvelopeSimple, InstagramLogo, LinkSimple, LinkedinLogo, Scissors, WhatsappLogo } from '@unifesto/unicon/react-native';
import { getRegistrationSources, sourceLabel, type RegistrationSources } from '../lib/api/tracking';
import { conversion, getTraffic, scopeParams, type TrafficStats } from '../lib/api/traffic';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { TrafficSummary, fmt } from '../components/traffic/TrafficSummary';
import { AppAlert } from '../components/ui/AppAlert';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { withUtm } from '../services/utm';
import { eventUrl } from '../hooks/useEventDetail';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';

const ICON = 28;

/** Channels a curator typically promotes on; each gets its own tracking link. */
const CHANNELS = [
  { source: 'instagram', medium: 'social', label: 'Instagram', Icon: InstagramLogo },
  { source: 'whatsapp', medium: 'social', label: 'WhatsApp', Icon: WhatsappLogo },
  { source: 'linkedin', medium: 'social', label: 'LinkedIn', Icon: LinkedinLogo },
  { source: 'email', medium: 'email', label: 'Email', Icon: EnvelopeSimple },
] as const;

/**
 * Tracking for one event (curators): where confirmed attendees came from, by
 * the utm tags of the link that brought them in, plus tracking links per
 * channel. Partners live on their own screen (EventPartnersScreen).
 */
export default function EventTrackingScreen() {
  const { eventId, slug, title } = useLocalSearchParams<{ eventId: string; slug: string; title?: string }>();
  const router = useRouter();
  const c = useCosmos();
  const [sources, setSources] = useState<RegistrationSources | null>(null);
  const [traffic, setTraffic] = useState<TrafficStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!eventId) return;
    const [res, views] = await Promise.all([
      getRegistrationSources(eventId),
      getTraffic({ kind: 'event', id: eventId }),
    ]);
    if (views.ok) setTraffic(views.data);
    if (res.ok) {
      setSources(res.data);
      setError('');
    } else setError(res.message);
  }, [eventId]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const publicUrl = eventUrl({ slug: slug || '', id: eventId || '' });

  const copy = async (source: string, medium: string, label: string) => {
    try {
      await Clipboard.setStringAsync(withUtm(publicUrl, { source, medium, campaign: slug || eventId }));
      AppAlert.alert('Link copied', `Registrations through it show up as ${label}.`);
    } catch {
      AppAlert.alert('Unable to copy', 'Please try again.');
    }
  };

  if (loading) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  const icon = (I: typeof LinkSimple) => <I size={ICON} color={c.text} />;
  const total = sources?.total ?? 0;

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
      {title ? (
        <Text style={[styles.event, { color: c.text }]} numberOfLines={2} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {error ? <Text style={[styles.error, { color: c.danger }]}>{error}</Text> : null}

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
            caption={`Views of the event page in the app, last ${traffic.days} days`}
          />
          <View style={{ height: spacing[8] }} />
        </>
      ) : null}

      <SettingsGroup title="Where registrations came from" plain>
        {total === 0 ? (
          <SettingsRow label="No confirmed registrations yet" />
        ) : (
          sources!.sources.map((s) => (
            <SettingsRow
              key={`${s.source}|${s.medium}|${s.campaign}`}
              label={sourceLabel(s)}
              value={`${s.registrations.toLocaleString('en-IN')} · ${Math.round((s.registrations / total) * 100)}%`}
              onPress={() =>
                router.push({
                  pathname: `/manage/event/${eventId}/source`,
                  params: { source: s.source ?? '', medium: s.medium ?? '', campaign: s.campaign ?? '' },
                })
              }
            />
          ))
        )}
      </SettingsGroup>
      {total > 0 ? (
        <Text style={[styles.note, { color: c.muted }]}>
          {sources!.tagged} of {total} came through a tracking link. Direct means none was opened in the 7 days before registering.
        </Text>
      ) : null}

      <View style={{ marginTop: spacing[8] }}>
        <SettingsGroup title="Tracking links">
          <SettingsRow
            icon={icon(Scissors)}
            label="Short links"
            onPress={() =>
              router.push({
                pathname: '/short-links',
                params: { ...scopeParams({ kind: 'event', id: eventId! }), title: title ?? '' },
              })
            }
          />
          {CHANNELS.map((c) => (
            <SettingsRow
              key={c.source}
              icon={icon(c.Icon)}
              label={`Copy ${c.label} link`}
              onPress={() => void copy(c.source, c.medium, c.label)}
            />
          ))}
          <SettingsRow
            icon={icon(LinkSimple)}
            label="Build a tracking link"
            onPress={() =>
              router.push({ pathname: '/utm-link', params: { url: publicUrl, title: title ?? '', campaign: slug ?? '' } })
            }
          />
        </SettingsGroup>
      </View>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  event: { fontSize: typography.fontSize['2xl'], lineHeight: 30, marginBottom: spacing[2], ...cosmosFont.display, letterSpacing: displayTracking(24) },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
  error: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
});
