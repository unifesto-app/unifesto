import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { EnvelopeSimple, InstagramLogo, LinkSimple, LinkedinLogo, WhatsappLogo } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getRegistrationSources, sourceLabel, type RegistrationSources } from '../lib/api/tracking';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { AppAlert } from '../components/ui/AppAlert';
import { withUtm } from '../services/utm';
import { eventUrl } from '../hooks/useEventDetail';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
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
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [sources, setSources] = useState<RegistrationSources | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('EventTracking');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getRegistrationSources(eventId);
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
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const icon = (I: typeof LinkSimple) => <I size={ICON} color={tokens.accent} weight="fill" />;
  const total = sources?.total ?? 0;

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
      {title ? <Text style={[styles.event, { color: tokens.text }]} numberOfLines={2}>{title}</Text> : null}
      {error ? <Text style={[styles.error, { color: tokens.danger }]}>{error}</Text> : null}

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
        <Text style={[styles.note, { color: tokens.textMuted }]}>
          {sources!.tagged} of {total} came through a tracking link. Direct means none was opened in the 7 days before registering.
        </Text>
      ) : null}

      <View style={{ marginTop: spacing[8] }}>
        <SettingsGroup title="Tracking links">
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  event: { fontSize: typography.fontSize.xl, marginBottom: spacing[2], ...font('heading') },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  error: { marginTop: spacing[3], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, ...font('medium') },
});
