import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CosmosScreen from '../components/ui/CosmosScreen';
import { GUTTER } from '../components/home/Section';
import { CATEGORY_LABEL, createTicket, type SupportTicketCategory } from '../lib/api/support';
import { BlockTitle, FieldRow } from '../components/manage/FormFields';
import ChipPicker from '../components/manage/ChipPicker';
import SaveBar from '../components/manage/SaveBar';
import { SettingsGroup } from '../components/profile/SettingsGroup';

const CATEGORIES = (Object.keys(CATEGORY_LABEL) as SupportTicketCategory[]).map((c) => ({ value: c, label: CATEGORY_LABEL[c] }));

/** Raise a case. From a space (operator support) it carries spaceId and goes to Unifesto. */
export default function NewSupportTicketScreen() {
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState<SupportTicketCategory>('EVENTS');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (subject.trim().length < 3) return setError('Add a short subject.');
    if (message.trim().length < 10) return setError('Tell us a bit more (10 characters or more).');
    setBusy(true);
    const t = await createTicket({
      subject: subject.trim(),
      message: message.trim(),
      category,
      ...(spaceId ? { spaceId } : {}),
    });
    setBusy(false);
    if (!t) return setError("Couldn't send. Check your connection and try again.");
    router.replace(`/manage/support/${t.id}`);
  };

  return (
    <CosmosScreen
      keyboard
      bottom={140 + insets.bottom}
      contentContainerStyle={styles.content}
      footer={<SaveBar visible label="Send" onPress={send} loading={busy} error={error} />}
    >
        <BlockTitle>About</BlockTitle>
        <ChipPicker options={CATEGORIES} value={category} onChange={(v) => v && setCategory(v)} />
        <SettingsGroup plain>
          <FieldRow
            stacked
            label="Subject"
            value={subject}
            onChangeText={(v) => {
              setError('');
              setSubject(v);
            }}
            maxLength={150}
          />
          <FieldRow
            stacked
            multiline
            label="What's going on?"
            value={message}
            onChangeText={(v) => {
              setError('');
              setMessage(v);
            }}
            placeholder="Which event, what you tried, what happened"
          />
        </SettingsGroup>
    </CosmosScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER },
});
