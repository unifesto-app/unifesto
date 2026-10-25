import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RefreshControl } from '../components/ui/RefreshControl';
import { CardBackdrop } from '../components/ui/CardSurface';
import { FieldRow } from '../components/manage/FormFields';
import ChipPicker from '../components/manage/ChipPicker';
import { SettingsGroup, SettingsRow } from '../components/profile/SettingsGroup';
import { Button } from '../components/ui';
import useTopSpacing from '../hooks/useTopSpacing';
import { onNotificationArrived } from '../lib/notificationBus';
import { getMyHelp, HELP_STATUS_LABEL, raiseHelpQuery, type MyHelp } from '../lib/api/hackathon';
import { timeAgo } from '../utils/checkinFormat';
import { borderRadius, spacing } from '../theme/spacing';
import { typography } from '../theme/typography';
import { cosmosFont, useCosmos } from '../theme/cosmos';

const GUTTER = spacing[6];
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
  const topSpacing = useTopSpacing();
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
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        {error ? <Text style={[styles.note, { color: c.muted, textAlign: 'center' }]}>{error}</Text> : <ActivityIndicator color={c.primary} />}
      </View>
    );
  }

  const volunteers = help.room?.volunteers.map((v) => v.name).filter(Boolean) ?? [];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topSpacing, paddingBottom: 100 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
            tintColor={c.primary}
            colors={[c.primary]}
            progressViewOffset={topSpacing}
          />
        }
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
                  <Text style={[styles.status, { color: q.status === 'RESOLVED' ? c.muted : c.primary }]}>
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: GUTTER },
  section: { marginTop: spacing[6], marginBottom: spacing[2], fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  note: { marginTop: spacing[2], marginHorizontal: spacing[1], fontSize: typography.fontSize.sm, lineHeight: typography.fontSize.sm * 1.5, ...cosmosFont.body },
  card: { borderRadius: borderRadius.xl, overflow: 'hidden', padding: spacing[4], marginBottom: spacing[3] },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing[2] },
  topic: { fontSize: typography.fontSize.base, ...cosmosFont.strong },
  status: { fontSize: typography.fontSize.sm, ...cosmosFont.strong },
  message: { marginTop: spacing[2], fontSize: typography.fontSize.base, lineHeight: typography.fontSize.base * 1.5, ...cosmosFont.body },
  meta: { marginTop: spacing[1], fontSize: typography.fontSize.xs, ...cosmosFont.body },
});
