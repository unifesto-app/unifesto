import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from '@unifesto/unicon/react-native';
import { useTokens } from '../../context/ThemeContext';
import useTopSpacing from '../../hooks/useTopSpacing';
import useAnalyticsScreenTracking from '../../hooks/useAnalyticsScreenTracking';
import { SettingsGroup, SettingsRow } from '../../components/profile/SettingsGroup';
import { BlockTitle, FieldRow, SwitchRow } from '../../components/manage/FormFields';
import ChipPicker from '../../components/manage/ChipPicker';
import DateTimeRow from '../../components/manage/DateTimeRow';
import SaveBar from '../../components/manage/SaveBar';
import EntityPickerRow, { type PickerItem } from '../../components/apex/EntityPickerRow';
import { AppAlert } from '../../components/ui/AppAlert';
import { pickEvents, pickSpaces, pickUsers } from '../../lib/apexPickers';
import { confirmPush } from '../../lib/pushConfirm';
import { createPushBroadcast, MAX_PUSH_USERS, type PushCategory, type PushTargetType } from '../../lib/api/apexComms';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { font } from '../../theme/fontHelpers';

const GUTTER = spacing[6];

const AUDIENCES: { value: PushTargetType; label: string }[] = [
  { value: 'users', label: 'Specific people' },
  { value: 'space', label: 'Space members' },
  { value: 'event', label: 'Event attendees' },
  { value: 'all', label: 'Everyone' },
];

const CATEGORIES: { value: PushCategory; label: string }[] = [
  { value: 'productUpdates', label: 'Product update' },
  { value: 'promotions', label: 'Promotion' },
];

const inAnHour = () => {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d;
};

/**
 * Compose a push: everyone, a space, an event's attendees, or hand-picked
 * people (opened pre-filled from a user's page). Opt-outs are honoured server
 * side; promotions only reach people who opted in.
 */
export default function PushComposeScreen() {
  const params = useLocalSearchParams<{ userId?: string; name?: string }>();
  const router = useRouter();
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const topSpacing = useTopSpacing();
  useAnalyticsScreenTracking('ApexPushCompose');

  const prefilled: PickerItem[] = params.userId ? [{ id: params.userId, title: params.name || 'User' }] : [];
  const [target, setTarget] = useState<PushTargetType>('users');
  const [users, setUsers] = useState<PickerItem[]>(prefilled);
  const [space, setSpace] = useState<PickerItem | null>(null);
  const [event, setEvent] = useState<PickerItem | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<PushCategory>('productUpdates');
  const [deepLink, setDeepLink] = useState('');
  const [scheduled, setScheduled] = useState(false);
  const [at, setAt] = useState(inAnHour);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const audienceReady =
    target === 'all' || (target === 'space' && !!space) || (target === 'event' && !!event) || (target === 'users' && users.length > 0);
  const ready = audienceReady && !!title.trim() && !!body.trim();

  const targetName =
    target === 'space' ? space?.title ?? null : target === 'event' ? event?.title ?? null : target === 'users' && users.length === 1 ? users[0].title : null;

  const send = async () => {
    setSending(true);
    setError('');
    const res = await createPushBroadcast({
      title: title.trim(),
      body: body.trim(),
      target: {
        type: target,
        ...(target === 'space' ? { spaceId: space!.id } : {}),
        ...(target === 'event' ? { eventId: event!.id } : {}),
        ...(target === 'users' ? { userIds: users.map((u) => u.id) } : {}),
      },
      category,
      deepLink: deepLink.trim() || undefined,
      scheduledAt: scheduled ? at.toISOString() : undefined,
    });
    setSending(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    router.back();
  };

  const submit = () => {
    if (!ready || sending) return;
    if (scheduled && at.getTime() <= Date.now()) {
      setError('Pick a time in the future, or turn scheduling off.');
      return;
    }
    const prompt = confirmPush({ target, category, userCount: users.length, targetName, scheduled });
    if (!prompt) {
      void send();
      return;
    }
    AppAlert.alert(prompt.title, prompt.message, [
      { text: 'Cancel', style: 'cancel' },
      { text: prompt.confirmLabel, onPress: () => void send() },
    ]);
  };

  const addUser = (u: PickerItem) => {
    setError('');
    setUsers((prev) => (prev.some((p) => p.id === u.id) || prev.length >= MAX_PUSH_USERS ? prev : [...prev, u]));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: tokens.bg }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: topSpacing, paddingHorizontal: GUTTER, paddingBottom: 160 + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <BlockTitle>Who gets it</BlockTitle>
        <ChipPicker options={AUDIENCES} value={target} onChange={(v) => v && setTarget(v)} />

        <SettingsGroup plain>
          {target === 'users' ? (
            <>
              {users.map((u) => (
                <SettingsRow
                  key={u.id}
                  label={u.title}
                  trailing={<X size={18} color={tokens.textMuted} />}
                  onPress={() => setUsers((prev) => prev.filter((p) => p.id !== u.id))}
                />
              ))}
              {users.length < MAX_PUSH_USERS ? (
                <EntityPickerRow add label={users.length ? 'Add another person' : 'Add a person'} search={pickUsers} onPick={addUser} pickedIds={users.map((u) => u.id)} />
              ) : null}
            </>
          ) : null}
          {target === 'space' ? <EntityPickerRow label="Space" value={space?.title} search={pickSpaces} onPick={setSpace} /> : null}
          {target === 'event' ? <EntityPickerRow label="Event" value={event?.title} search={pickEvents} onPick={setEvent} /> : null}
          {target === 'all' ? <SettingsRow label="Every app user who hasn't opted out" /> : null}
        </SettingsGroup>

        <SettingsGroup title="Message" plain>
          <FieldRow stacked label="Title" value={title} onChangeText={setTitle} placeholder="Short and specific" maxLength={255} />
          <FieldRow stacked multiline label="Message" value={body} onChangeText={setBody} placeholder="What should they know?" maxLength={2000} />
        </SettingsGroup>

        <View style={styles.block}>
          <BlockTitle>Sent as</BlockTitle>
        </View>
        <ChipPicker options={CATEGORIES} value={category} onChange={(v) => v && setCategory(v)} />
        <Text style={[styles.hint, { color: tokens.textMuted }]}>
          {category === 'productUpdates'
            ? 'Reaches everyone except people who turned product updates off.'
            : 'Marketing. Only reaches people who opted in to promotions.'}
        </Text>

        <SettingsGroup title="Options" plain>
          <FieldRow
            stacked
            label="Opens (optional)"
            value={deepLink}
            onChangeText={setDeepLink}
            placeholder="unifesto://event/slug"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <SwitchRow label="Schedule for later" value={scheduled} onValueChange={setScheduled} />
          {scheduled ? <DateTimeRow label="Send at" value={at} onChange={setAt} minimumDate={new Date()} /> : null}
        </SettingsGroup>
      </ScrollView>

      <SaveBar visible={ready} label={scheduled ? 'Schedule push' : 'Send push'} onPress={submit} loading={sending} error={error} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing[8] },
  hint: { marginTop: spacing[2], marginBottom: spacing[2], marginLeft: spacing[1], fontSize: typography.fontSize.xs, ...font() },
});
