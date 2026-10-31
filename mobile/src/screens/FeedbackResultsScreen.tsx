import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { DownloadSimple } from '@unifesto/unicon/react-native';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import CosmosScreen from '../components/ui/CosmosScreen';
import ShadeCard from '../components/ui/ShadeCard';
import { GUTTER } from '../components/home/Section';
import { getFeedbackResults, type FeedbackResults } from '../lib/api/feedback';
import { openSpaceWeb } from '../lib/openOnWeb';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

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
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[8] }} />
        )}
      </CosmosScreen>
    );
  }

  const pct = (n: number) => Math.round((n * 100) / Math.max(1, data.count));

  return (
    <CosmosScreen contentContainerStyle={styles.content}>
      {data.count ? (
        <>
          {/* The screen's hero: the average rating, on the event's sky shade. */}
          <ShadeCard tone="sky" style={styles.hero}>
            <Text style={[styles.heroLabel, { color: c.soft }]}>Average rating</Text>
            <Text style={[styles.big, { color: c.sky }]} accessibilityLabel={data.averageRating != null ? `${data.averageRating} out of 5` : 'No average yet'}>
              {data.averageRating != null ? data.averageRating : '-'}
              <Text style={[styles.of, { color: c.muted }]}> / 5</Text>
            </Text>
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Text style={[styles.statValue, { color: c.text }]}>{data.count.toLocaleString('en-IN')}</Text>
                <Text style={[styles.statLabel, { color: c.muted }]}>{data.count === 1 ? 'Response' : 'Responses'}</Text>
              </View>
              <View style={styles.heroStat}>
                <Text style={[styles.statValue, { color: c.text }]}>{data.nps.score != null ? String(data.nps.score) : '-'}</Text>
                <Text style={[styles.statLabel, { color: c.muted }]}>NPS</Text>
              </View>
            </View>
          </ShadeCard>

          <SettingsGroup title="Ratings">
            {[...data.distribution].reverse().map((d) => (
              <View
                key={d.value}
                style={styles.barRow}
                accessible
                accessibilityLabel={`${d.value} stars: ${d.count} ${d.count === 1 ? 'response' : 'responses'}, ${pct(d.count)}%`}
              >
                <Text style={[styles.barLabel, { color: c.muted }]}>{d.value}★</Text>
                <View style={[styles.track, { backgroundColor: c.tint }]}>
                  <View style={[styles.fill, { backgroundColor: c.sky, width: `${pct(d.count)}%` }]} />
                </View>
                <Text style={[styles.barCount, { color: c.text }]}>{pct(d.count)}%</Text>
              </View>
            ))}
          </SettingsGroup>
        </>
      ) : (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: c.text }]} accessibilityRole="header">
            No feedback yet
          </Text>
          <Text style={[styles.muted, { color: c.muted, marginTop: spacing[2] }]}>
            Responses show up here as attendees rate the event.
          </Text>
        </View>
      )}

      {data.comments.length ? (
        <SettingsGroup title={`Comments (${data.comments.length})`}>
          {data.comments.map((m, i) => (
            <View key={i} style={styles.comment}>
              <Text style={[styles.commentRating, { color: c.sky }]}>{m.rating}★</Text>
              <Text style={[styles.commentText, { color: c.text }]}>{m.comment}</Text>
            </View>
          ))}
        </SettingsGroup>
      ) : null}

      {/* Question summaries and the CSV live on the web (D3). */}
      <SettingsGroup title="More">
        <SettingsRow
          icon={<DownloadSimple size={24} color={c.text} />}
          label="Answers and CSV on the web"
          external
          onPress={() => openSpaceWeb(`/events/${eventId}/feedback`, spaceId)}
        />
      </SettingsGroup>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: spacing[10] },
  muted: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, textAlign: 'center', ...cosmosFont.body },
  hero: { marginTop: spacing[4] },
  heroLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  big: { marginTop: spacing[1], fontSize: 40, lineHeight: 48, ...cosmosFont.figure },
  of: { fontSize: typography.fontSize.xl, ...cosmosFont.figure },
  heroStats: { flexDirection: 'row', gap: spacing[8], marginTop: spacing[4] },
  heroStat: { gap: 2 },
  statValue: { fontSize: typography.fontSize.xl, lineHeight: 28, ...cosmosFont.figure },
  statLabel: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  barLabel: { width: 28, fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  // Thin progress fill on a tint track (DESIGN §3).
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  barCount: { width: 44, textAlign: 'right', fontSize: typography.fontSize.sm, ...cosmosFont.figure },
  empty: { marginTop: spacing[10], alignItems: 'center', paddingHorizontal: spacing[4] },
  emptyTitle: { fontSize: typography.fontSize.xl, lineHeight: 26, textAlign: 'center', ...cosmosFont.display },
  comment: { flexDirection: 'row', gap: spacing[3], paddingHorizontal: spacing[4], paddingVertical: spacing[3] },
  commentRating: { width: 28, fontSize: typography.fontSize.sm, lineHeight: 20, ...cosmosFont.figure },
  commentText: { flex: 1, fontSize: typography.fontSize.sm, lineHeight: 20, ...cosmosFont.body },
});
