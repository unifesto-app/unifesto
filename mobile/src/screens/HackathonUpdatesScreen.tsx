import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button } from '../components/ui';
import TabPager from '../components/ui/TabPager';
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
import { rememberNid } from '../services/utm';
import { onNotificationArrived } from '../lib/notificationBus';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, displayTracking, useCosmos } from '../theme/cosmos';

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
 * push was off or the notification was swiped away. Each one is a row on the
 * page with full hairlines between them (a sky dot while unread), no cards.
 */
type Feed = { items: InAppNotification[] | null; nextBefore: string | null };
const NO_FEED: Feed = { items: null, nextBefore: null };

export default function HackathonUpdatesScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useCosmos();
  const { isAuthenticated } = useAuth();
  // One feed per tab, so the pager can show both side by side. A hackathon's
  // updates use just 'mine'.
  const [feeds, setFeeds] = useState<Record<InboxTab, Feed>>({ mine: NO_FEED, staff: NO_FEED });
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<InboxTab>('mine');
  const [hasStaff, setHasStaff] = useState(false);
  // Bumped by every reload; a response from an older one is dropped.
  const gen = useRef(0);

  const scopeOf = useCallback(
    (t: InboxTab): FeedScope =>
      eventId ? { eventId } : t === 'staff' ? { type: STAFF_NOTIFICATION_TYPE } : { excludeType: STAFF_NOTIFICATION_TYPE },
    [eventId],
  );
  const setFeed = (t: InboxTab, next: (f: Feed) => Feed) => setFeeds((prev) => ({ ...prev, [t]: next(prev[t]) }));

  const load = useCallback(async () => {
    const mine = ++gen.current;
    const [res, staff] = await Promise.all([
      getNotifications(scopeOf('mine')),
      // Inbox only: the staff queries, which also decide whether the tabs show.
      eventId ? null : getNotifications(scopeOf('staff')),
    ]);
    if (staff?.ok) setHasStaff(staff.data.items.length > 0);
    if (mine !== gen.current) return;
    if (staff?.ok) setFeeds((prev) => ({ ...prev, staff: { items: staff.data.items, nextBefore: staff.data.nextBefore } }));
    if (!res.ok) {
      setError(res.message);
      setFeeds((prev) => ({ ...prev, mine: { ...prev.mine, items: prev.mine.items ?? [] } }));
      return;
    }
    setFeeds((prev) => ({ ...prev, mine: { items: res.data.items, nextBefore: res.data.nextBefore } }));
    setError('');
    if (eventId && res.data.items.some((n) => !n.readAt)) void markNotificationsRead({ eventId });
  }, [eventId, scopeOf]);

  const markAllRead = async (t: InboxTab) => {
    const res = await markNotificationsRead(scopeOf(t));
    if (!res.ok) return setError(res.message);
    const now = new Date().toISOString();
    setFeed(t, (f) => ({ ...f, items: f.items?.map((n) => (n.readAt ? n : { ...n, readAt: now })) ?? f.items }));
  };

  const open = (t: InboxTab, n: InAppNotification, target: string | null) => {
    if (!n.readAt) {
      void markNotificationsRead({ ids: [n.id] });
      const now = new Date().toISOString();
      setFeed(t, (f) => ({ ...f, items: f.items?.map((x) => (x.id === n.id ? { ...x, readAt: now } : x)) ?? f.items }));
    }
    // C19: a booking in the next 24 h is credited to this notice.
    void rememberNid(n.data?.nid);
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

  const more = async (t: InboxTab) => {
    const before = feeds[t].nextBefore;
    if (!before) return;
    setLoadingMore(true);
    const mine = gen.current;
    const res = await getNotifications({ ...scopeOf(t), before });
    setLoadingMore(false);
    if (!res.ok || mine !== gen.current) return;
    setFeed(t, (f) => ({ items: [...(f.items ?? []), ...res.data.items], nextBefore: res.data.nextBefore }));
  };

  const showTabs = !eventId && (hasStaff || tab === 'staff');
  if (!feeds.mine.items && !showTabs) {
    return (
      <CosmosScreen>
        <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
      </CosmosScreen>
    );
  }

  const hub = eventId ? `/hackathon/${eventId}` : null;

  const renderFeed = (t: InboxTab) => {
    const { items, nextBefore } = feeds[t];
    const anyUnread = !eventId && !!items?.some((n) => !n.readAt);
    return (
      <>
        {anyUnread ? (
          <Pressable onPress={() => void markAllRead(t)} style={styles.markAll} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.markAllText, { color: c.text }]}>Mark all as read</Text>
          </Pressable>
        ) : null}

        {!items ? (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: c.text }]} accessibilityRole="header">
              {eventId ? 'No updates yet' : t === 'staff' ? 'No staff queries' : 'No notifications yet'}
            </Text>
            <Text style={[styles.note, { color: c.muted, textAlign: 'center' }]}>
              {eventId
                ? 'Room changes, results and messages from the organisers will appear here and as notifications.'
                : t === 'staff'
                  ? 'Help-desk queries from teams at events you staff will appear here.'
                  : 'Registrations, reminders and updates from organisers will appear here.'}
            </Text>
          </View>
        ) : null}

        <View>
          {(items ?? []).map((n, i) => {
            const path = normalizeDeepLink(n.deepLink);
            // Updates that point back at the hub have nowhere else to go.
            const target = path && path !== hub ? n.deepLink : null;
            return (
              <Pressable
                key={n.id}
                disabled={!target && (!!eventId || !!n.readAt)}
                onPress={() => open(t, n, target)}
                style={({ pressed }) => [
                  styles.card,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
                  pressed && { opacity: 0.6 },
                ]}
                accessibilityRole={target ? 'button' : 'text'}
              >
                <View style={styles.cardHead}>
                  {!n.readAt ? <View style={[styles.dot, { backgroundColor: c.sky }]} accessibilityLabel="Unread" /> : null}
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
          <Button label="Show older" variant="secondary" loading={loadingMore} onPress={() => void more(t)} style={{ marginTop: spacing[5] }} />
        ) : null}
      </>
    );
  };

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
        <TabPager inline tabs={TABS} value={tab} onChange={setTab} tabsStyle={{ marginBottom: spacing[4] }} renderPage={renderFeed} />
      ) : (
        renderFeed('mine')
      )}
      {error ? <Text style={[styles.note, { color: c.danger }]}>{error}</Text> : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  // An empty state on the page: a headline and one muted line, no card.
  empty: { alignItems: 'center', marginTop: spacing[10] },
  emptyTitle: { fontSize: 24, lineHeight: 30, textAlign: 'center', ...cosmosFont.display, letterSpacing: displayTracking(24) },
  // One notification as a row on the page.
  card: { paddingVertical: spacing[4] },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  dot: { width: 6, height: 6, borderRadius: 3 },
  markAll: { alignSelf: 'flex-end', marginBottom: spacing[3] },
  markAllText: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  title: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  body: { marginTop: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  time: { marginTop: spacing[2], fontSize: typography.fontSize.xs, ...cosmosFont.figure },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
});
