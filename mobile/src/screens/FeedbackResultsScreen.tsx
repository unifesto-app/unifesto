import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { DownloadSimple } from '@unifesto/unicon/react-native';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { getFeedbackResults, type FeedbackResults } from '../lib/api/feedback';
import { openSpaceWeb } from '../lib/openOnWeb';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

/** F3: an event's feedback for its curators: averages, NPS, the rating spread and comments. */
export default function FeedbackResultsScreen() {
  const { eventId, spaceId } = useLocalSearchParams<{ eventId: string; spaceId?: string }>();
  const c = useCosmos();
  const [data, setData] = useState<FeedbackResults | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (eventId) void getFeedbackResults(eventId).then((r) => (r.ok ? setData(r.data) : setError(r.message)));
  }, [eventId]);

  if (!data) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        {error ? (
          <Text style={[styles.muted, { color: c.soft }]}>{error}</Text>
        ) : (
          <ActivityIndicator color={c.primary} style={{ marginTop: spacing[8] }} />
        )}
      </CosmosScreen>
    );
  }

  const stat = (label: string, value: string) => (
    <View style={[styles.stat, { backgroundColor: c.raised }]}>
      <Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: c.muted }]}>{label}</Text>
    </View>
  );

  return (
    <CosmosScreen contentContainerStyle={styles.content}>
      <View style={styles.stats}>
        {stat('Responses', String(data.count))}
        {stat('Average', data.averageRating != null ? `${data.averageRating} / 5` : '-')}
        {stat('NPS', data.nps.score != null ? String(data.nps.score) : '-')}
      </View>

      {data.count ? (
        <SettingsGroup title="Ratings" surface={c.raised}>
          {[...data.distribution].reverse().map((d) => (
            <View key={d.value} style={styles.barRow}>
              <Text style={[styles.barLabel, { color: c.muted }]}>{d.value}★</Text>
              <View style={[styles.track, { backgroundColor: c.input }]}>
                <View style={[styles.fill, { backgroundColor: c.primary, width: `${Math.round((d.count * 100) / data.count)}%` }]} />
              </View>
              <Text style={[styles.barCount, { color: c.muted }]}>{d.count}</Text>
            </View>
          ))}
        </SettingsGroup>
      ) : (
        <Text style={[styles.muted, { color: c.soft, marginTop: spacing[6] }]}>
          No feedback yet. Responses show up here as attendees rate the event.
        </Text>
      )}

      {data.comments.length ? (
        <SettingsGroup title={`Comments (${data.comments.length})`} surface={c.raised}>
          {data.comments.map((m, i) => (
            <View key={i} style={styles.comment}>
              <Text style={[styles.commentText, { color: c.text }]}>
                <Text style={cosmosFont.strong}>{m.rating}★ </Text>
                {m.comment}
              </Text>
            </View>
          ))}
        </SettingsGroup>
      ) : null}

      {/* Question summaries and the CSV live on the web (D3). */}
      <SettingsGroup title="More" surface={c.raised}>
        <SettingsRow
          icon={<DownloadSimple size={24} color={c.text} />}
          label="Answers and CSV on the web"
          external
          onPress={() => openSpaceWeb(`/dashboard/events/${eventId}/feedback`, spaceId)}
        />
      </SettingsGroup>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: spacing[10] },
  muted: { fontSize: typography.fontSize.sm, textAlign: 'center', ...cosmosFont.body },
  stats: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[4] },
  stat: { flex: 1, borderRadius: cosmosCardRadius, padding: spacing[4], alignItems: 'center' },
  statValue: { fontSize: typography.fontSize.xl, ...cosmosFont.figure },
  statLabel: { marginTop: 2, fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[2] },
  barLabel: { width: 28, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  barCount: { width: 32, textAlign: 'right', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  comment: { paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  commentText: { fontSize: typography.fontSize.sm, lineHeight: 20, ...cosmosFont.body },
});
