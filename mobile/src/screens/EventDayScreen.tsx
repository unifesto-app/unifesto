import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChatsCircle, Lifebuoy, Megaphone, QrCode } from '@unifesto/unicon/react-native';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { FieldRow } from '../components/manage/FormFields';
import { Button } from '../components/ui';
import { AppAlert } from '../components/ui/AppAlert';
import { useManageEvent } from '../hooks/useManageEvent';
import { useEventDay } from '../hooks/useEventDay';
import { announceToAttendees } from '../lib/api/manageEvent';
import { HELP_STATUS_LABEL } from '../lib/api/hackathon';
import { formatTime } from '../utils/eventFormat';
import { inr } from '../utils/money';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const ICON = 26;

/**
 * Organiser "event day" cockpit (G8): live check-ins, today's money, the help
 * desk queue and an announcement box on one screen, refreshing itself while
 * open. Each section shows only if the server lets this user use it.
 */
export default function EventDayScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const router = useRouter();
  const c = useCosmos();
  const h = useManageEvent(eventId);
  const e = h.event;
  const day = useEventDay(eventId!, e?.spaceId, { money: h.access.canViewAttendees });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  if (!e) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        {h.error ? (
          <View style={[styles.card, { backgroundColor: c.raised }]}>
            <Text style={[styles.body, { color: c.soft, textAlign: 'center' }]}>{h.error}</Text>
            <Button label="Try again" variant="secondary" onPress={() => void h.retry()} style={{ marginTop: spacing[4], alignSelf: 'center' }} />
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  const stats = day.stats ?? h.checkin;
  const total = stats?.total ?? 0;
  const inNow = stats?.checkedIn ?? 0;
  const progress = total > 0 ? Math.min(1, inNow / total) : 0;
  const scanParams = { title: e.title, startDateTime: e.startDateTime, venueName: e.venueName || e.city || '' };
  const live = new Date(e.startDateTime).getTime() <= Date.now();

  const send = () => {
    const t = title.trim();
    const b = body.trim();
    if (!t || !b) return AppAlert.alert('Add a title and a message', 'Both show in the notification.');
    AppAlert.alert('Send to everyone attending?', 'They get a push notification and a copy in their inbox. You can send 3 a day.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          setSending(true);
          const res = await announceToAttendees(e.id, { title: t, body: b });
          setSending(false);
          if (!res.ok) return AppAlert.alert("Couldn't send", res.message);
          setTitle('');
          setBody('');
          AppAlert.alert('Sent', 'Everyone attending has it now.');
        },
      },
    ]);
  };

  return (
    <CosmosScreen refreshing={h.refreshing} onRefresh={() => void Promise.all([h.refresh(), day.refresh()])} keyboard contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: c.text }]} numberOfLines={2} accessibilityRole="header">
        {e.title}
      </Text>
      <Text style={[styles.meta, { color: live ? c.success : c.muted }]}>
        {live ? 'Live now' : 'Today'} · {formatTime(new Date(e.startDateTime))} to {formatTime(new Date(e.endDateTime))}
        {day.updatedAt ? <Text style={{ color: c.muted }}>{` · updated ${formatTime(day.updatedAt)}`}</Text> : null}
      </Text>

      {/* Check-in */}
      <View style={[styles.card, { backgroundColor: c.raised, marginTop: spacing[6] }]}>
        <Text style={[styles.cardTitle, { color: c.muted }]}>Checked in</Text>
        <Text style={[styles.big, { color: c.text }]} accessibilityLabel={`${inNow} of ${total} checked in`}>
          {inNow.toLocaleString('en-IN')}
          <Text style={[styles.of, { color: c.muted }]}>{` of ${total.toLocaleString('en-IN')}`}</Text>
        </Text>
        <View style={[styles.track, { backgroundColor: c.tint }]}>
          <View style={[styles.fill, { width: `${progress * 100}%`, backgroundColor: c.primary }]} />
        </View>
        <Text style={[styles.small, { color: c.soft }]}>
          {Math.round(progress * 100)}% in · {(stats?.remaining ?? 0).toLocaleString('en-IN')} to go
        </Text>
        {h.access.canScan ? (
          <View style={styles.actions}>
            <Button
              label="Scan"
              icon={<QrCode size={18} color={c.primaryFg} weight="bold" />}
              onPress={() => router.push({ pathname: `/checkin/${e.id}`, params: scanParams })}
              style={styles.action}
            />
            <Button
              label="Find someone"
              variant="secondary"
              onPress={() => router.push({ pathname: `/checkin/${e.id}/manual`, params: scanParams })}
              style={styles.action}
            />
          </View>
        ) : null}
        {day.recent.length ? (
          <View style={{ marginTop: spacing[4] }}>
            {day.recent.map((r) => (
              <View key={r.id} style={[styles.recent, { borderTopColor: c.border }]}>
                <Text style={[styles.body, { color: c.text, flex: 1 }]} numberOfLines={1}>
                  {r.attendeeName}
                </Text>
                <Text style={[styles.time, { color: c.muted }]}>{formatTime(new Date(r.checkedInAt))}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {/* Money today */}
      {day.today ? (
        <Pressable
          onPress={() => router.push({ pathname: `/manage/event/${e.id}/transactions`, params: { slug: e.slug, spaceId: e.spaceId } })}
          accessibilityRole="button"
          accessibilityLabel={`Collected today ${inr(day.today.collected)}, ${day.today.payments} payments. Opens transactions`}
          style={({ pressed }) => [styles.card, { backgroundColor: c.raised, marginTop: spacing[4], opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[styles.cardTitle, { color: c.muted }]}>Collected today</Text>
          <Text style={[styles.big, { color: c.text }]}>{inr(day.today.collected)}</Text>
          <Text style={[styles.small, { color: c.soft }]}>
            {day.today.payments} {day.today.payments === 1 ? 'payment' : 'payments'} since midnight
          </Text>
        </Pressable>
      ) : null}

      {/* Help desk */}
      {day.desk ? (
        <SettingsGroup title={`Help desk${day.desk.open.length ? ` · ${day.desk.open.length} waiting` : ''}`}>
          {day.desk.open.length === 0 ? <SettingsRow label="Nothing waiting" /> : null}
          {day.desk.kind === 'hackathon'
            ? day.desk.open.slice(0, 3).map((q) => (
                <SettingsRow
                  key={q.id}
                  label={`${q.team.teamCode ?? q.team.name} · ${q.topicName}`}
                  value={HELP_STATUS_LABEL[q.status]}
                  onPress={() => router.push(`/hackathon/${e.id}/help-desk`)}
                />
              ))
            : day.desk.open.slice(0, 3).map((t) => (
                <SettingsRow key={t.id} label={t.subject} onPress={() => router.push(`/manage/support/${t.id}`)} />
              ))}
          <SettingsRow
            icon={<Lifebuoy size={ICON} color={c.text} />}
            label="Open help desk"
            onPress={() =>
              day.desk?.kind === 'hackathon' ? router.push(`/hackathon/${e.id}/help-desk`) : router.push(`/manage/space/${e.spaceId}/support`)
            }
          />
        </SettingsGroup>
      ) : null}

      {/* Announce: event:edit holders only; the server allows 3 a day. */}
      {h.access.hosts ? (
        <>
          <SettingsGroup title="Tell everyone" plain>
            <FieldRow stacked label="Title" value={title} onChangeText={setTitle} placeholder="Doors open at 6" maxLength={255} />
            <FieldRow
              stacked
              multiline
              label="Message"
              value={body}
              onChangeText={setBody}
              placeholder="Head to Hall B, bring your pass."
              maxLength={2000}
            />
          </SettingsGroup>
          <Text style={[styles.small, { color: c.muted, marginHorizontal: spacing[1] }]}>
            A push notification and an inbox copy to everyone attending. Up to 3 a day.
          </Text>
          <Button
            label="Send to attendees"
            size="lg"
            fullWidth
            loading={sending}
            icon={<Megaphone size={18} color={c.primaryFg} weight="bold" />}
            onPress={send}
            style={{ marginTop: spacing[4] }}
          />
          {day.desk?.kind === 'hackathon' ? (
            <SettingsGroup>
              <SettingsRow
                icon={<ChatsCircle size={ICON} color={c.text} />}
                label="Announce to teams, judges or a room"
                onPress={() => router.push(`/manage/event/${e.id}/hackathon/announce`)}
              />
            </SettingsGroup>
          ) : null}
        </>
      ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  title: { fontSize: typography.fontSize.xl, lineHeight: 30, ...cosmosFont.display },
  meta: { marginTop: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  card: { borderRadius: cosmosCardRadius, padding: spacing[5] },
  cardTitle: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  big: { marginTop: spacing[1], fontSize: 40, lineHeight: 48, ...cosmosFont.figure },
  of: { fontSize: typography.fontSize.lg, ...cosmosFont.figure },
  track: { marginTop: spacing[3], height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  small: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.45, ...cosmosFont.body },
  actions: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[5] },
  action: { flex: 1 },
  recent: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], paddingVertical: spacing[3], borderTopWidth: StyleSheet.hairlineWidth },
  body: { fontSize: typography.fontSize.base, ...cosmosFont.body },
  time: { fontSize: typography.fontSize.sm, ...cosmosFont.figure },
});
