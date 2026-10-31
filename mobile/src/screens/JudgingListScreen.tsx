import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { CaretRight, Gavel, Broadcast, MapPin } from '@unifesto/unicon/react-native';
import { getMyJudgingEvents, JudgingEvent } from '../lib/api/leaderboard';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';
import { CardBackdrop } from '../components/ui/CardSurface';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER, Section } from '../components/home/Section';

function formatDate(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function JudgingListScreen() {
  const router = useRouter();
  const c = useCosmos();

  const [events, setEvents] = useState<JudgingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const rows = await getMyJudgingEvents();
    setEvents(rows);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <CosmosScreen>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  if (events.length === 0) {
    return (
      <CosmosScreen contentContainerStyle={styles.pad} refreshing={refreshing} onRefresh={onRefresh}>
        <View style={styles.empty}>
          <CardBackdrop shape={styles.empty} />
          <Gavel size={56} color={c.text} weight="duotone" style={styles.emptyIcon} />
          <Text style={[styles.emptyTitle, { color: c.text }]} accessibilityRole="header">
            No judging yet
          </Text>
          <Text style={[styles.emptyText, { color: c.muted }]}>
            Events where you've been invited to judge or mentor will appear here.
          </Text>
        </View>
      </CosmosScreen>
    );
  }

  return (
    <CosmosScreen refreshing={refreshing} onRefresh={onRefresh}>
      <Section title="My panels" subtitle={`${events.length} ${events.length === 1 ? 'event' : 'events'}`} style={{ marginTop: 0 }}>
      <View style={styles.pad}>

        {events.map((ev) => (
          <Pressable
            key={ev.boardId}
            // Scale, not opacity: opacity breaks Liquid Glass.
            style={({ pressed }) => [styles.card, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
            accessibilityRole="button"
            accessibilityLabel={`${ev.title}, ${ev.kind === 'JUDGE' ? 'judge' : 'mentor'}`}
            onPress={() =>
              router.push({
                pathname: `/judging/${ev.eventId}`,
                params: { title: ev.title },
              })
            }
          >
            <CardBackdrop shape={styles.card} />
            <View style={styles.cardContent}>
              <View style={styles.cardTop}>
                <View style={styles.cardTextContent}>
                  <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
                    {ev.title}
                  </Text>
                  <View style={styles.dateRow}>
                    <Text style={[styles.dateText, { color: c.muted }]}>{formatDate(ev.startDateTime)}</Text>
                    {(ev.venueName || ev.city) && (
                      <>
                        <MapPin size={14} color={c.muted} weight="fill" />
                        <Text style={[styles.venueText, { color: c.muted }]} numberOfLines={1}>
                          {ev.venueName || ev.city}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              </View>

              <View style={[styles.cardDivider, { backgroundColor: c.border }]} />

              <View style={styles.cardFooter}>
                <View style={styles.metaRow}>
                  <Text style={[styles.kindText, { color: c.soft }]}>{ev.kind === 'JUDGE' ? 'Judge' : 'Mentor'}</Text>
                  {ev.activeRounds > 0 ? (
                    <View style={styles.liveRow}>
                      <Broadcast size={14} color={c.mint} weight="fill" />
                      <Text style={[styles.liveText, { color: c.mint }]}>
                        {ev.activeRounds} open {ev.activeRounds === 1 ? 'round' : 'rounds'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.idleText, { color: c.muted }]}>No open rounds</Text>
                  )}
                </View>
                <View style={styles.arrowIcon}>
                  <CaretRight size={15} color={c.muted} />
                </View>
              </View>
            </View>
          </Pressable>
        ))}
      </View>
      </Section>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: GUTTER },
  card: { borderRadius: cosmosCardRadius, marginBottom: spacing[3], overflow: 'hidden' },
  cardContent: { padding: spacing[5] },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing[3] },
  cardTextContent: { flex: 1 },
  title: { fontSize: 17, marginBottom: spacing[1], lineHeight: 24, ...cosmosFont.strong },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  dateText: { fontSize: typography.fontSize.sm, ...cosmosFont.figure },
  venueText: { flexShrink: 1, fontSize: typography.fontSize.sm, ...cosmosFont.body },
  cardDivider: { height: StyleSheet.hairlineWidth, marginVertical: spacing[3] },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], flex: 1 },
  kindText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
  liveText: { fontSize: typography.fontSize.sm, ...cosmosFont.figure },
  idleText: { fontSize: typography.fontSize.sm, ...cosmosFont.body },
  arrowIcon: { width: 24, height: 24, alignItems: 'flex-end', justifyContent: 'center' },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6], alignItems: 'center' },
  emptyIcon: { marginBottom: spacing[5] },
  emptyTitle: { fontSize: 22, lineHeight: 28, marginBottom: spacing[2], textAlign: 'center', ...cosmosFont.display },
  emptyText: { fontSize: typography.fontSize.sm, textAlign: 'center', lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
});
