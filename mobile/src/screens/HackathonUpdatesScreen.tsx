import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { RefreshControl } from '../components/ui/RefreshControl';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { useTokens } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import useTopSpacing from '../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../hooks/useAnalyticsScreenTracking';
import { getNotifications, markNotificationsRead, type InAppNotification } from '../lib/api/hackathon';
import { normalizeDeepLink, routeToDeepLink } from '../services/deepLinkRouter';
import { onNotificationArrived } from '../lib/notificationBus';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * The in-app notification feed, newest first. With an `eventId` it's one
 * hackathon's updates; without, it's the whole inbox (the bell on Home). Each
 * push is also kept here, so it isn't lost if push was off or the notification
 * was swiped away. Opening the screen marks them read.
 */
export default function HackathonUpdatesScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<InAppNotification[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useAnalyticsScreenTracking(eventId ? 'HackathonUpdates' : 'Notifications');

  const load = useCallback(async () => {
    const res = await getNotifications({ eventId });
    if (!res.ok) {
      setError(res.message);
      setItems((i) => i ?? []);
      return;
    }
    setItems(res.data.items);
    setNextBefore(res.data.nextBefore);
    setError('');
    if (res.data.items.some((n) => !n.readAt)) void markNotificationsRead({ eventId });
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(
    () =>
      onNotificationArrived((n) => {
        if (!eventId || !n.eventId || n.eventId === eventId) void load();
      }),
    [eventId, load],
  );

  const more = async () => {
    if (!nextBefore) return;
    setLoadingMore(true);
    const res = await getNotifications({ eventId, before: nextBefore });
    setLoadingMore(false);
    if (!res.ok) return;
    setItems((i) => [...(i ?? []), ...res.data.items]);
    setNextBefore(res.data.nextBefore);
  };

  if (!items) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const hub = eventId ? `/hackathon/${eventId}` : null;

  return (
    <ScrollView
      style={{ backgroundColor: tokens.bg }}
      contentContainerStyle={[styles.content, { paddingTop: topSpacing }]}
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
          colors={[tokens.accent]}
          progressViewOffset={topSpacing}
        />
      }
    >
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: tokens.text }]}>{eventId ? 'No updates yet' : 'No notifications yet'}</Text>
          <Text style={[styles.note, { color: tokens.textMuted, textAlign: 'center' }]}>
            {eventId
              ? 'Room changes, results and messages from the organisers will appear here and as notifications.'
              : 'Registrations, reminders and updates from organisers will appear here.'}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: spacing[3] }}>
        {items.map((n) => {
          const path = normalizeDeepLink(n.deepLink);
          // Updates that point back at the hub have nowhere else to go.
          const target = path && path !== hub ? n.deepLink : null;
          return (
            <Pressable
              key={n.id}
              disabled={!target}
              onPress={() => routeToDeepLink(target, { isAuthenticated })}
              style={({ pressed }) => [styles.card, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
              accessibilityRole={target ? 'button' : 'text'}
            >
              <CardBackdrop shape={styles.card} />
              <View style={styles.cardHead}>
                {!n.readAt ? <View style={[styles.dot, { backgroundColor: tokens.accent }]} /> : null}
                <Text style={[styles.title, { color: tokens.text }]} numberOfLines={2}>
                  {n.title}
                </Text>
              </View>
              <Text style={[styles.body, { color: tokens.textSecondary }]}>{n.body}</Text>
              <Text style={[styles.time, { color: tokens.textMuted }]}>{when(n.createdAt)}</Text>
            </Pressable>
          );
        })}
      </View>

      {nextBefore ? (
        <Button label="Show older" variant="secondary" loading={loadingMore} onPress={() => void more()} style={{ marginTop: spacing[5] }} />
      ) : null}
      {error ? <Text style={[styles.note, { color: tokens.danger }]}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { marginTop: spacing[10], alignItems: 'center' },
  emptyTitle: { fontSize: typography.fontSize.lg, ...font('semibold') },
  card: { borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[4] },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  title: { flex: 1, fontSize: typography.fontSize.base, ...font('semibold') },
  body: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  time: { marginTop: spacing[2], fontSize: typography.fontSize.xs, ...font() },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
});
