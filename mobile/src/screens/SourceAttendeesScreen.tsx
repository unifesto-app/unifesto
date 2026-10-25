import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { UserCircle } from '@unifesto/unicon/react-native';
import { getSourceAttendees, sourceLabel, type SourceAttendee } from '../lib/api/tracking';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

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
  const c = useCosmos();
  const [rows, setRows] = useState<SourceAttendee[] | null>(null);
  const [error, setError] = useState('');

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
      <CosmosScreen contentContainerStyle={styles.content}>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  const people = (r: SourceAttendee) => r.groupSize ?? r.quantity ?? 1;
  const headcount = (rows ?? []).reduce((n, r) => n + people(r), 0);

  return (
    <CosmosScreen contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: c.text }]}>{sourceLabel(tags)}</Text>
      <Text style={[styles.muted, { color: c.muted }]}>
        {[tags.medium, tags.campaign].filter(Boolean).join(' · ') || 'No tags'}
      </Text>

      {error ? (
        <View style={[styles.empty, { backgroundColor: c.raised }]}>
          <Text style={[styles.emptyText, { color: c.soft }]}>{error}</Text>
        </View>
      ) : rows!.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: c.raised }]}>
          <Text style={[styles.emptyText, { color: c.soft }]}>No confirmed registrations from this source.</Text>
        </View>
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
                    <UserCircle size={ICON} color={c.primary} weight="fill" />
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
            <Text style={[styles.note, { color: c.muted }]}>Showing the latest 500.</Text>
          ) : null}
        </View>
      )}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  title: { fontSize: typography.fontSize.xl, ...cosmosFont.display },
  muted: { marginTop: 2, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  empty: { marginTop: spacing[6], borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
  avatar: { width: ICON, height: ICON, borderRadius: ICON / 2 },
});
