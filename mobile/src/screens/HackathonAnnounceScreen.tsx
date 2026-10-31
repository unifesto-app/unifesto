import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Megaphone } from '@unifesto/unicon/react-native';
import { BlockTitle, FieldRow } from '../components/manage/FormFields';
import SaveBar from '../components/manage/SaveBar';
import ChipPicker from '../components/manage/ChipPicker';
import { CardBackdrop } from '../components/ui/CardSurface';
import { AppAlert } from '../components/ui/AppAlert';
import { SettingsGroup } from '../components/profile/SettingsGroup';
import CosmosScreen from '../components/ui/CosmosScreen';
import { Button } from '../components/ui/Button';
import { GUTTER } from '../components/home/Section';
import { getAnnouncements, sendAnnouncement, type AnnouncementAudience, type Announcements } from '../lib/api/hackathon';
import { formatWhen } from '../lib/hackathon';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const AUDIENCES: { value: AnnouncementAudience; label: string; hint: string }[] = [
  { value: 'ALL', label: 'Everyone', hint: 'Every team member, judge and mentor.' },
  { value: 'TEAMS', label: 'Teams', hint: 'Every member of every team.' },
  { value: 'JUDGES', label: 'Judges and mentors', hint: 'Only judges and mentors.' },
  { value: 'ROOM', label: 'One room', hint: 'Members of the teams in one room.' },
];

const audienceLabel = (a: Announcements['announcements'][number]) =>
  a.audience === 'ROOM' ? a.roomName ?? 'A room' : AUDIENCES.find((x) => x.value === a.audience)?.label ?? a.audience;

/**
 * Send an announcement (push + in-app, in everyone's updates feed) to the
 * whole hackathon, only teams, only judges and mentors, or one room; and see
 * what was sent before.
 */
export default function HackathonAnnounceScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Announcements | null>(null);
  const [audience, setAudience] = useState<AnnouncementAudience>('ALL');
  const [roomId, setRoomId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getAnnouncements(eventId);
    if (res.ok) setData(res.data);
    else setError(res.message);
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!data) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        {error ? (
          <View style={styles.empty}>
            <CardBackdrop shape={styles.empty} />
            <Text style={[styles.emptyText, { color: c.soft }]}>{error}</Text>
            <Button variant="secondary" label="Try again" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  const send = () => {
    if (!title.trim()) return setError('Add a title, like "Lunch is served".');
    if (!body.trim()) return setError('Write the message.');
    if (audience === 'ROOM' && !roomId) return setError('Pick the room.');
    const who = audience === 'ROOM' ? data.rooms.find((r) => r.id === roomId)?.name : AUDIENCES.find((a) => a.value === audience)?.label.toLowerCase();
    AppAlert.alert(`Send to ${who}?`, 'It goes out as a notification and stays in their updates.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          setSending(true);
          const res = await sendAnnouncement(eventId!, {
            audience,
            ...(audience === 'ROOM' ? { roomId } : {}),
            title: title.trim(),
            body: body.trim(),
          });
          setSending(false);
          if (!res.ok) return setError(res.message);
          setData(res.data);
          setTitle('');
          setBody('');
          setError('');
          const sent = res.data.announcements[0];
          AppAlert.alert('Sent', `${sent?.recipients ?? 0} ${sent?.recipients === 1 ? 'person' : 'people'} will get it.`);
        },
      },
    ]);
  };

  return (
    <CosmosScreen
      keyboard
      keyboardDismissMode="interactive"
      bottom={140 + insets.bottom}
      contentContainerStyle={styles.content}
      footer={<SaveBar visible={!!(title.trim() || body.trim()) || !!error} label="Send announcement" onPress={send} loading={sending} error={error} />}
    >
      <BlockTitle>Send to</BlockTitle>
      <ChipPicker
        options={AUDIENCES.map((a) => ({ value: a.value, label: a.label }))}
        value={audience}
        onChange={(v) => {
          if (!v) return;
          setAudience(v);
          setError('');
        }}
      />
      <Text style={[styles.note, { color: c.muted }]}>{AUDIENCES.find((a) => a.value === audience)?.hint}</Text>
      {audience === 'ROOM' ? (
        <View style={{ marginTop: spacing[3] }}>
          {data.rooms.length ? (
            <ChipPicker
              options={data.rooms.map((r) => ({ value: r.id, label: `${r.name} (${r.teams})` }))}
              value={roomId}
              onChange={(v) => v && setRoomId(v)}
            />
          ) : (
            <Text style={[styles.note, { color: c.warn }]}>Add rooms first.</Text>
          )}
        </View>
      ) : null}

      <SettingsGroup plain>
        <FieldRow stacked label="Title" value={title} onChangeText={(v) => (setTitle(v), setError(''))} placeholder="Lunch is served" maxLength={120} />
        <FieldRow
          stacked
          multiline
          label="Message"
          value={body}
          onChangeText={(v) => (setBody(v), setError(''))}
          placeholder="Head to the atrium. Veg and non-veg counters are on the left."
          maxLength={2000}
        />
      </SettingsGroup>

      {data.announcements.length ? (
        <>
          <Text style={[styles.section, { color: c.muted }]}>Sent</Text>
          {data.announcements.map((a) => (
            <View key={a.id} style={styles.card}>
              <CardBackdrop shape={styles.card} />
              <View style={styles.cardHead}>
                <Megaphone size={18} color={c.muted} weight="fill" />
                <Text style={[styles.cardTitle, { color: c.text }]} numberOfLines={2}>
                  {a.title}
                </Text>
              </View>
              <Text style={[styles.cardBody, { color: c.soft }]}>{a.body}</Text>
              <Text style={[styles.meta, { color: c.muted }]}>
                {audienceLabel(a)} · {a.recipients} {a.recipients === 1 ? 'person' : 'people'} · {formatWhen(a.createdAt)}
                {a.sentBy ? ` · ${a.sentBy}` : ''}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  empty: { borderRadius: cosmosCardRadius, padding: spacing[6] },
  emptyText: { textAlign: 'center', fontSize: typography.fontSize.sm, ...cosmosFont.body },
  section: { marginTop: spacing[8], marginBottom: spacing[3], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden', padding: spacing[5], marginBottom: spacing[3] },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  cardTitle: { flex: 1, fontSize: typography.fontSize.base, ...cosmosFont.strong },
  cardBody: { marginTop: spacing[2], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  meta: { marginTop: spacing[2], fontSize: typography.fontSize.xs, ...cosmosFont.strong },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.xs, lineHeight: typography.fontSize.xs * 1.5, ...cosmosFont.body },
});
