import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { RefreshControl } from '../components/ui/RefreshControl';
import { CardBackdrop } from '../components/ui/CardSurface';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useTokens } from '../context/ThemeContext';
import useTopSpacing from '../hooks/useTopSpacing';
import { onNotificationArrived } from '../lib/notificationBus';
import {
  escalateHelpQuery,
  getHelpInbox,
  HELP_STATUS_LABEL,
  setHelpQueryStatus,
  type HelpInbox,
  type HelpInboxQuery,
  type HelpQueryStatus,
} from '../lib/api/hackathon';
import { timeAgo } from '../utils/checkinFormat';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { font } from '../theme/fontHelpers';

const GUTTER = spacing[6];

/**
 * The event team's help desk: queries teams raised that were sent to me (as a
 * topic POC or room volunteer), or every query for curators. Pick one up so
 * the team knows someone's coming, then resolve it.
 */
export default function HackathonHelpDeskScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const tokens = useTokens();
  const topSpacing = useTopSpacing();
  const [inbox, setInbox] = useState<HelpInbox | undefined>(undefined);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getHelpInbox(eventId);
    if (res.ok) {
      setInbox(res.data);
      setError('');
    } else {
      setError(res.message);
      setInbox((i) => (i === undefined ? null : i));
    }
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(
    () =>
      onNotificationArrived((n) => {
        if (!n.eventId || n.eventId === eventId) void load();
      }),
    [eventId, load],
  );

  const move = async (q: HelpInboxQuery, status: HelpQueryStatus) => {
    setBusy(q.id);
    const res = await setHelpQueryStatus(eventId!, q.id, status);
    setBusy(null);
    if (!res.ok) return AppAlert.alert("Couldn't update", res.message);
    setInbox(res.data);
  };

  // D27: the organisers get it as a Space Assist case; the query stays here.
  const escalate = (q: HelpInboxQuery) =>
    AppAlert.alert('Escalate to the organisers?', 'They get this query, with the team and room, as an Assist case.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Escalate',
        onPress: async () => {
          setBusy(q.id);
          const res = await escalateHelpQuery(eventId!, q.id);
          setBusy(null);
          if (!res.ok) return AppAlert.alert("Couldn't escalate", res.message);
          setInbox(res.data);
        },
      },
    ]);

  if (inbox === undefined) {
    return (
      <View style={[styles.center, { backgroundColor: tokens.bg }]}>
        <ActivityIndicator color={tokens.accent} />
      </View>
    );
  }

  const queries = inbox?.queries ?? [];
  const active = queries.filter((q) => q.status !== 'RESOLVED');
  const resolved = queries.filter((q) => q.status === 'RESOLVED');

  const card = (q: HelpInboxQuery) => {
    const statusColor = q.status === 'OPEN' ? tokens.danger : q.status === 'ACKNOWLEDGED' ? tokens.accent : tokens.textMuted;
    return (
      <View key={q.id} style={styles.card}>
        <CardBackdrop shape={styles.card} />
        <View style={styles.cardHead}>
          <Text style={[styles.topic, { color: tokens.text }]}>{q.topicName}</Text>
          <Text style={[styles.status, { color: statusColor }]}>
            {HELP_STATUS_LABEL[q.status]}
            {q.handledByName && q.status !== 'OPEN' ? ` · ${q.handledByMe ? 'you' : q.handledByName}` : ''}
          </Text>
        </View>
        <Text style={[styles.meta, { color: tokens.textSecondary }]}>
          {[q.team.teamCode, q.team.name, q.roomName].filter(Boolean).join(' · ')}
        </Text>
        <Text style={[styles.message, { color: tokens.text }]}>{q.message}</Text>
        <Text style={[styles.meta, { color: tokens.textMuted }]}>
          {[q.raisedByName, timeAgo(q.createdAt)].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.actions}>
          {q.status === 'OPEN' ? (
            <Button label="I'm on it" size="sm" loading={busy === q.id} onPress={() => void move(q, 'ACKNOWLEDGED')} style={{ flex: 1 }} />
          ) : null}
          {q.status !== 'RESOLVED' ? (
            <Button
              label="Resolved"
              size="sm"
              variant="secondary"
              loading={busy === q.id && q.status === 'ACKNOWLEDGED'}
              disabled={busy === q.id}
              onPress={() => void move(q, 'RESOLVED')}
              style={{ flex: 1 }}
            />
          ) : (
            <Button label="Reopen" size="sm" variant="secondary" loading={busy === q.id} onPress={() => void move(q, 'OPEN')} style={{ flex: 1 }} />
          )}
        </View>
        {q.caseId ? (
          <Button
            label="Escalated · Open case"
            size="sm"
            variant="ghost"
            onPress={() => router.push(`/manage/support/${q.caseId}`)}
            style={styles.escalate}
          />
        ) : q.status !== 'RESOLVED' ? (
          <Button label="Escalate to organiser" size="sm" variant="ghost" disabled={busy === q.id} onPress={() => escalate(q)} style={styles.escalate} />
        ) : null}
      </View>
    );
  };

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
      {!inbox ? (
        <Text style={[styles.empty, { color: tokens.textMuted }]}>{error || 'This event isn’t running a hackathon.'}</Text>
      ) : (
        <>
          <Text style={[styles.lead, { color: tokens.textSecondary }]}>
            {inbox.canManage ? 'Every query teams raised.' : 'Queries sent to you as a point of contact or room volunteer.'}
          </Text>
          <Text style={[styles.section, { color: tokens.textMuted }]}>Open · {active.length}</Text>
          {active.length ? active.map(card) : <Text style={[styles.empty, { color: tokens.textMuted }]}>All clear. New queries show up here.</Text>}
          {resolved.length ? (
            <>
              <Text style={[styles.section, { color: tokens.textMuted }]}>Resolved</Text>
              {resolved.map(card)}
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, paddingBottom: 100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  lead: { fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  section: { marginTop: spacing[6], marginBottom: spacing[2], fontSize: typography.fontSize.sm, ...font('medium') },
  empty: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...font() },
  card: { borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[4], marginBottom: spacing[3] },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing[2] },
  topic: { fontSize: typography.fontSize.base, ...font('semibold') },
  status: { fontSize: typography.fontSize.sm, ...font('medium') },
  meta: { marginTop: spacing[1], fontSize: typography.fontSize.xs, ...font() },
  message: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.5, ...font() },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[3] },
  escalate: { marginTop: spacing[2] },
});
