import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import SegmentedTabs from '../components/ui/SegmentedTabs';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { useAuth } from '../context/AuthContext';
import {
  getNotifications,
  markNotificationsRead,
  STAFF_NOTIFICATION_TYPE,
  type FeedScope,
  type InAppNotification,
} from '../lib/api/hackathon';
import { normalizeDeepLink, routeToDeepLink } from '../services/deepLinkRouter';
import { onNotificationArrived } from '../lib/notificationBus';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

type InboxTab = 'mine' | 'staff';
const TABS: { key: InboxTab; label: string }[] = [
  { key: 'mine', label: 'For me' },
  { key: 'staff', label: 'Staff' },
];

/**
 * The in-app notification feed, newest first. With an `eventId` it's one
 * hackathon's updates, marked read on open. Without, it's the whole inbox (the
 * bell on Home): help-desk queries sent to event staff sit in their own Staff
 * tab (shown once there are any), a tap marks one read, and "Mark all as read"
 * clears the tab on display. Each push is also kept here, so it isn't lost if
 * push was off or the notification was swiped away.
 */
export default function HackathonUpdatesScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useCosmos();
  const { isAuthenticated } = useAuth();
  const [items, setItems] = useState<InAppNotification[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<InboxTab>('mine');
  const [hasStaff, setHasStaff] = useState(false);
  // Bumped by every reload and tab switch; a response from an older one is dropped.
  const gen = useRef(0);

  const scope: FeedScope = eventId
    ? { eventId }
    : tab === 'staff'
      ? { type: STAFF_NOTIFICATION_TYPE }
      : { excludeType: STAFF_NOTIFICATION_TYPE };
  const scopeKey = JSON.stringify(scope);

  const load = useCallback(async () => {
    const current = JSON.parse(scopeKey) as FeedScope;
    const mine = ++gen.current;
    const [res, staff] = await Promise.all([
      getNotifications(current),
      // Inbox only: whether this person gets staff queries at all (shows the tabs).
      eventId ? null : getNotifications({ type: STAFF_NOTIFICATION_TYPE, limit: 1 }),
    ]);
    if (staff?.ok) setHasStaff(staff.data.items.length > 0);
    if (mine !== gen.current) return;
    if (!res.ok) {
      setError(res.message);
      setItems((i) => i ?? []);
      return;
    }
    setItems(res.data.items);
    setNextBefore(res.data.nextBefore);
    setError('');
    if (eventId && res.data.items.some((n) => !n.readAt)) void markNotificationsRead({ eventId });
  }, [eventId, scopeKey]);

  const markAllRead = async () => {
    const res = await markNotificationsRead(scope);
    if (!res.ok) return setError(res.message);
    const now = new Date().toISOString();
    setItems((i) => i?.map((n) => (n.readAt ? n : { ...n, readAt: now })) ?? i);
  };

  const open = (n: InAppNotification, target: string | null) => {
    if (!n.readAt) {
      void markNotificationsRead({ ids: [n.id] });
      const now = new Date().toISOString();
      setItems((i) => i?.map((x) => (x.id === n.id ? { ...x, readAt: now } : x)) ?? i);
    }
    if (target) routeToDeepLink(target, { isAuthenticated });
  };

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
    const mine = gen.current;
    const res = await getNotifications({ ...scope, before: nextBefore });
    setLoadingMore(false);
    if (!res.ok || mine !== gen.current) return;
    setItems((i) => [...(i ?? []), ...res.data.items]);
    setNextBefore(res.data.nextBefore);
  };

  const showTabs = !eventId && (hasStaff || tab === 'staff');
  if (!items && !showTabs) {
    return (
      <CosmosScreen>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  const hub = eventId ? `/hackathon/${eventId}` : null;
  const anyUnread = !eventId && !!items?.some((n) => !n.readAt);

  return (
    <CosmosScreen
      contentContainerStyle={styles.content}
      bottom={100}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      {showTabs ? (
        <View style={{ marginBottom: spacing[4] }}>
          <SegmentedTabs
            tabs={TABS}
            value={tab}
            onChange={(t) => {
              gen.current += 1;
              setTab(t);
              setItems(null);
              setNextBefore(null);
            }}
          />
        </View>
      ) : null}

      {anyUnread ? (
        <Pressable onPress={() => void markAllRead()} style={styles.markAll} accessibilityRole="button" hitSlop={8}>
          <Text style={[styles.markAllText, { color: c.text }]}>Mark all as read</Text>
        </Pressable>
      ) : null}

      {!items ? (
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <CardBackdrop shape={styles.empty} />
          <Text style={[styles.emptyTitle, { color: c.text }]} accessibilityRole="header">
            {eventId ? 'No updates yet' : tab === 'staff' ? 'No staff queries' : 'No notifications yet'}
          </Text>
          <Text style={[styles.note, { color: c.muted, textAlign: 'center' }]}>
            {eventId
              ? 'Room changes, results and messages from the organisers will appear here and as notifications.'
              : tab === 'staff'
                ? 'Help-desk queries from teams at events you staff will appear here.'
                : 'Registrations, reminders and updates from organisers will appear here.'}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: spacing[3] }}>
        {(items ?? []).map((n) => {
          const path = normalizeDeepLink(n.deepLink);
          // Updates that point back at the hub have nowhere else to go.
          const target = path && path !== hub ? n.deepLink : null;
          return (
            <Pressable
              key={n.id}
              disabled={!target && (!!eventId || !!n.readAt)}
              onPress={() => open(n, target)}
              style={({ pressed }) => [styles.card, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
              accessibilityRole={target ? 'button' : 'text'}
            >
              <CardBackdrop shape={styles.card} />
              <View style={styles.cardHead}>
                {!n.readAt ? <View style={[styles.dot, { backgroundColor: c.text }]} accessibilityLabel="Unread" /> : null}
                <Text style={[styles.title, { color: c.text }]} numberOfLines={2}>
                  {n.title}
                </Text>
              </View>
              <Text style={[styles.body, { color: c.soft }]}>{n.body}</Text>
              <Text style={[styles.time, { color: c.muted }]}>{when(n.createdAt)}</Text>
            </Pressable>
          );
        })}
      </View>

      {nextBefore ? (
        <Button label="Show older" variant="secondary" loading={loadingMore} onPress={() => void more()} style={{ marginTop: spacing[5] }} />
      ) : null}
      {error ? <Text style={[styles.note, { color: c.danger }]}>{error}</Text> : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6], alignItems: 'center' },
  emptyTitle: { fontSize: 22, lineHeight: 28, textAlign: 'center', ...cosmosFont.display },
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden', padding: spacing[5] },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  markAll: { alignSelf: 'flex-end', marginBottom: spacing[3] },
  markAllText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  title: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  body: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  time: { marginTop: spacing[2], fontSize: typography.fontSize.xs, ...cosmosFont.figure },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
});
