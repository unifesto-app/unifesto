import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { RefreshControl } from '../components/ui/RefreshControl';
import { useRouter } from 'expo-router';
import { CaretRight, Gavel, CalendarBlank, Broadcast, MapPin } from 'phosphor-react-native';
import { useTheme } from '../context/ThemeContext';
import { getMyJudgingEvents, JudgingEvent } from '../lib/api/leaderboard';
import { spacing, borderRadius, font } from '../theme';
import { getFontFamily } from '../theme/fontHelpers';
import useTopSpacing from '../hooks/useTopSpacing';

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
  const { colors } = useTheme();
  const topSpacing = useTopSpacing();

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

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: spacing[8] },
    listSection: { paddingHorizontal: spacing[6] },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing[4],
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: getFontFamily('bold'),
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    eventCount: {
      fontSize: 13,
      fontFamily: getFontFamily('semibold'),
      color: colors.primary,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: borderRadius['2xl'],
      marginBottom: spacing[3],
      overflow: 'hidden',
      ...Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
        },
        android: { elevation: 4 },
      }),
    },
    cardContent: { padding: spacing[4] },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing[3],
      marginBottom: spacing[3],
    },
    iconChip: {
      width: 48,
      height: 48,
      borderRadius: borderRadius.xl,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.backgroundSecondary,
    },
    cardTextContent: { flex: 1 },
    title: {
      fontSize: 17,
      fontFamily: getFontFamily('bold'),
      color: colors.text,
      marginBottom: spacing[1],
      lineHeight: 24,
      letterSpacing: -0.3,
    },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
    dateText: {
      fontSize: 14,
      fontFamily: getFontFamily('medium'),
      color: colors.textMuted,
      letterSpacing: -0.1,
    },
    cardDivider: {
      height: 1,
      backgroundColor: colors.borderMuted,
      marginVertical: spacing[3],
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], flex: 1 },
    kindPill: {
      paddingHorizontal: spacing[3],
      paddingVertical: 4,
      borderRadius: borderRadius.full,
      backgroundColor: colors.backgroundSecondary,
    },
    kindPillText: {
      fontSize: 11,
      fontFamily: getFontFamily('bold'),
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    liveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[1] },
    liveText: {
      fontSize: 12,
      fontFamily: getFontFamily('semibold'),
      color: colors.success,
    },
    idleText: {
      fontSize: 12,
      fontFamily: getFontFamily('medium'),
      color: colors.textMuted,
    },
    arrowIcon: {
      width: 32,
      height: 32,
      borderRadius: borderRadius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: topSpacing + 120,
      paddingHorizontal: spacing[6],
    },
    emptyIconContainer: {
      width: 96,
      height: 96,
      borderRadius: borderRadius['3xl'],
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing[6],
      backgroundColor: colors.backgroundSecondary,
    },
    emptyTitle: {
      fontSize: 22,
      ...font('heading'),
      color: colors.text,
      marginBottom: spacing[2],
      textAlign: 'center',
      letterSpacing: -0.5,
    },
    emptyText: {
      fontSize: 15,
      fontFamily: getFontFamily('normal'),
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 300,
    },
  });

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
      tintColor={colors.primary}
    />
  );

  if (events.length === 0) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.center}
        refreshControl={refreshControl}
      >
        <View style={styles.emptyIconContainer}>
          <Gavel size={52} color={colors.primary} weight="duotone" />
        </View>
        <Text style={styles.emptyTitle}>No judging yet</Text>
        <Text style={styles.emptyText}>
          Events where you've been invited to judge or mentor will appear here.
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing + spacing[4] }]}
      contentInsetAdjustmentBehavior="never"
      refreshControl={refreshControl}
    >
      <View style={styles.listSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Panels</Text>
          <Text style={styles.eventCount}>
            {events.length} {events.length === 1 ? 'event' : 'events'}
          </Text>
        </View>

        {events.map((ev) => (
          <TouchableOpacity
            key={ev.boardId}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() =>
              router.push({
                pathname: `/judging/${ev.eventId}`,
                params: { title: ev.title },
              })
            }
          >
            <View style={styles.cardContent}>
              <View style={styles.cardTop}>
                <View style={styles.iconChip}>
                  <CalendarBlank size={24} color={colors.primary} weight="duotone" />
                </View>
                <View style={styles.cardTextContent}>
                  <Text style={styles.title} numberOfLines={2}>
                    {ev.title}
                  </Text>
                  <View style={styles.dateRow}>
                    <Text style={styles.dateText}>{formatDate(ev.startDateTime)}</Text>
                    {(ev.venueName || ev.city) && (
                      <>
                        <MapPin size={14} color={colors.textMuted} weight="fill" />
                        <Text style={styles.dateText} numberOfLines={1}>
                          {ev.venueName || ev.city}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.cardDivider} />

              <View style={styles.cardFooter}>
                <View style={styles.metaRow}>
                  <View style={styles.kindPill}>
                    <Text style={styles.kindPillText}>
                      {ev.kind === 'JUDGE' ? 'Judge' : 'Mentor'}
                    </Text>
                  </View>
                  {ev.activeRounds > 0 ? (
                    <View style={styles.liveRow}>
                      <Broadcast size={14} color={colors.success} weight="fill" />
                      <Text style={styles.liveText}>
                        {ev.activeRounds} open {ev.activeRounds === 1 ? 'round' : 'rounds'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.idleText}>No open rounds</Text>
                  )}
                </View>
                <View style={styles.arrowIcon}>
                  <CaretRight size={18} color={colors.textMuted} weight="bold" />
                </View>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
