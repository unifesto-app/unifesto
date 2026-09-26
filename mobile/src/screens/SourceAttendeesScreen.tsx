import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { UserCircle } from 'phosphor-react-native';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getSourceAttendees, sourceLabel, type SourceAttendee } from '../lib/api/tracking';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];
const ICON = 28;

/** Route params carry the tags as strings; '' means untagged (the Direct row). */
const orNull = (v?: string) => (v ? v : null);

/**
 * Who registered through one source of an event's breakdown (curators with
 * attendee access). Tapping a person opens their attendee detail.
 */
export default function SourceAttendeesScreen() {
  const params = useLocalSearchParams<{ eventId: string; source?: string; medium?: string; campaign?: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [rows, setRows] = useState<SourceAttendee[] | null>(null);
  const [error, setError] = useState('');

  useAnalyticsScreenTracking('SourceAttendees');

  const tags = { source: orNull(params.source), medium: orNull(params.medium), campaign: orNull(params.campaign) };

  useEffect(() => {
    if (!params.eventId) return;
    let live = true;
    void getSourceAttendees(params.eventId, tags).then((res) => {
      if (!live) return;
      if (res.ok) setRows(res.data);
      else setError(res.denied ? 'You need attendee access on this event to see who registered.' : res.message);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.eventId, params.source, params.medium, params.campaign]);

  if (!rows && !error) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const people = (r: SourceAttendee) => r.groupSize ?? r.quantity ?? 1;
  const headcount = (rows ?? []).reduce((n, r) => n + people(r), 0);

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: tokens.text }]}>{sourceLabel(tags)}</Text>
      <Text style={[styles.muted, { color: tokens.textMuted }]}>
        {[tags.medium, tags.campaign].filter(Boolean).join(' · ') || 'No tags'}
      </Text>

      {error ? (
        <Text style={[styles.empty, { color: tokens.textMuted }]}>{error}</Text>
      ) : rows!.length === 0 ? (
        <Text style={[styles.empty, { color: tokens.textMuted }]}>No confirmed registrations from this source.</Text>
      ) : (
        <View style={{ marginTop: spacing[6] }}>
          <SettingsGroup
            title={`${rows!.length.toLocaleString('en-IN')} ${rows!.length === 1 ? 'booking' : 'bookings'} · ${headcount.toLocaleString('en-IN')} ${headcount === 1 ? 'person' : 'people'}`}
          >
            {rows!.map((r) => (
              <SettingsRow
                key={r.id}
                icon={
                  r.user.avatarUrl ? (
                    <Image source={{ uri: r.user.avatarUrl }} style={styles.avatar} />
                  ) : (
                    <UserCircle size={ICON} color={tokens.accent} weight="fill" />
                  )
                }
                label={r.user.fullName || r.user.username || 'Attendee'}
                value={
                  people(r) > 1
                    ? `Group of ${people(r)}`
                    : new Date(r.registeredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                }
                onPress={() => router.push(`/manage/event/${params.eventId}/attendee/${r.id}`)}
              />
            ))}
          </SettingsGroup>
          {rows!.length === 500 ? (
            <Text style={[styles.note, { color: tokens.textMuted }]}>Showing the latest 500.</Text>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 80 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  title: { fontSize: typography.fontSize.xl, ...font('heading') },
  muted: { marginTop: 2, fontSize: typography.fontSize.sm, ...font() },
  empty: { marginTop: spacing[10], textAlign: 'center', fontSize: typography.fontSize.sm, ...font() },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  avatar: { width: ICON, height: ICON, borderRadius: ICON / 2 },
});
