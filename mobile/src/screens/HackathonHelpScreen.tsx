import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CardBackdrop } from '../components/ui/CardSurface';
import { FieldRow } from '../components/manage/FormFields';
import ChipPicker from '../components/manage/ChipPicker';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { onNotificationArrived } from '../lib/notificationBus';
import { getMyHelp, HELP_STATUS_LABEL, raiseHelpQuery, type MyHelp } from '../lib/api/hackathon';
import { timeAgo } from '../utils/checkinFormat';
import { spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosCardRadius, cosmosFont, useCosmos } from '../theme/cosmos';

const OTHER = 'OTHER';

/**
 * A team asks the organisers for help: pick a topic (Food, Wi-Fi… or Other),
 * say what's needed, and it goes to that topic's contacts and the room's
 * volunteers. The team sees who's on it and when it's resolved.
 */
export default function HackathonHelpScreen() {
  const { eventId } = useLocalSearchParams<{ eventId: string }>();
  const c = useCosmos();
  const insets = useSafeAreaInsets();
  const [help, setHelp] = useState<MyHelp | null>(null);
  const [topic, setTopic] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!eventId) return;
    const res = await getMyHelp(eventId);
    if (res.ok) setHelp(res.data);
    else setError(res.message);
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

  const send = async () => {
    if (!topic) return setError('Pick what it’s about.');
    if (!message.trim()) return setError('Say what you need.');
    setSending(true);
    const res = await raiseHelpQuery(eventId!, { topicId: topic === OTHER ? null : topic, message: message.trim() });
    setSending(false);
    if (!res.ok) return setError(res.message);
    setHelp(res.data);
    setTopic('');
    setMessage('');
    setSent(true);
  };

  if (!help) {
    return (
      <CosmosScreen contentContainerStyle={styles.content}>
        {error ? (
          <View style={[styles.empty, { backgroundColor: c.raised }]}>
            <Text style={[styles.emptyText, { color: c.soft }]}>{error}</Text>
            <Button variant="secondary" label="Try again" onPress={() => void load()} style={{ marginTop: spacing[4] }} />
          </View>
        ) : (
          <ActivityIndicator color={c.text} style={{ marginTop: spacing[10] }} />
        )}
      </CosmosScreen>
    );
  }

  const volunteers = help.room?.volunteers.map((v) => v.name).filter(Boolean) ?? [];

  return (
    <CosmosScreen
      keyboard
      keyboardDismissMode="interactive"
      bottom={100 + insets.bottom}
      contentContainerStyle={styles.content}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      {help.room ? (
        <SettingsGroup title={`Volunteers in ${help.room.name}`}>
          <SettingsRow label={volunteers.length ? volunteers.join(', ') : 'None assigned yet'} />
        </SettingsGroup>
      ) : null}

      <Text style={[styles.section, { color: c.muted }]}>What’s it about?</Text>
      <ChipPicker
        options={[...help.topics.map((t) => ({ value: t.id, label: t.name })), { value: OTHER, label: 'Other' }]}
        value={topic}
        onChange={(v) => {
          setError('');
          setSent(false);
          setTopic(v);
        }}
      />
      <SettingsGroup plain>
        <FieldRow
          stacked
          multiline
          label="What do you need?"
          value={message}
          onChangeText={(v) => {
            setError('');
            setSent(false);
            setMessage(v);
          }}
          placeholder="Our table's power strip isn't working"
          maxLength={1000}
        />
      </SettingsGroup>
      <Button label="Send" size="lg" fullWidth loading={sending} disabled={!topic || !message.trim()} onPress={() => void send()} style={{ marginTop: spacing[4] }} />
      {error ? <Text style={[styles.note, { color: c.danger }]}>{error}</Text> : null}
      {sent ? <Text style={[styles.note, { color: c.success }]}>Sent. We’ll notify you when someone picks it up.</Text> : null}

      {help.queries.length ? (
        <>
          <Text style={[styles.section, { color: c.muted }]}>Your queries</Text>
          {help.queries.map((q) => (
            <View key={q.id} style={styles.card}>
              <CardBackdrop shape={styles.card} />
              <View style={styles.cardHead}>
                <Text style={[styles.topic, { color: c.text }]}>{q.topicName}</Text>
                <Text style={[styles.status, { color: q.status === 'RESOLVED' ? c.muted : c.warn }]}>
                  {HELP_STATUS_LABEL[q.status]}
                  {q.status !== 'OPEN' && q.handledByName ? ` · ${q.handledByName}` : ''}
                </Text>
              </View>
              <Text style={[styles.message, { color: c.soft }]}>{q.message}</Text>
              <Text style={[styles.meta, { color: c.muted }]}>{timeAgo(q.createdAt)}</Text>
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
  section: { marginTop: spacing[6], marginBottom: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  card: { borderRadius: cosmosCardRadius, overflow: 'hidden', padding: spacing[4], marginBottom: spacing[3] },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing[2] },
  topic: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  status: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  message: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.5, ...cosmosFont.body },
  meta: { marginTop: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
